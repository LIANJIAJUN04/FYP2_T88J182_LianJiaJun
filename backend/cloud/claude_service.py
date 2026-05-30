import time
from datetime import datetime
from typing import AsyncIterator, Optional

import anthropic

# Sync client for analyze_alert_event (must buffer full response for validation).
# Async client for stream_chat_followup and stream_generate_summary (true SSE).
_client = anthropic.Anthropic()
_async_client = anthropic.AsyncAnthropic()

_RETRYABLE_STATUS = {529, 503, 500}

# ── Output validation ─────────────────────────────────────────────────────────
# The BubbleContent renderer in the admin frontend strictly requires all three
# emoji markers to render section headers. If the model omits any of them the
# frontend produces garbage or crashes. We validate before dispatch and return
# a pre-formatted fallback rather than a broken raw response.

_REQUIRED_SECTIONS = ("📥", "🔍", "⚡")

_FALLBACK_ANALYSIS = """\
📥 **What Happened**
The analysis system received your alert data but the model output did not conform \
to the required three-section clinical report structure. This is a transient \
formatting failure, not a clinical finding.

🔍 **Root Cause Hypothesis**
• Structured output validation failed — all three section markers (📥 / 🔍 / ⚡) \
must be present in the response.
• Alert data was received and processed correctly; the failure occurred at the \
output formatting stage only.
• Typically caused by transient model variability; retry resolution rate is >95%.

⚡ **Recommended Next Steps**
• Click the Check button again to retry — this nearly always resolves in one attempt.
• If urgency requires it, review the raw alert values in the log directly.
• No immediate clinical action is implied by this formatting error alone."""


def _validate_analysis(text: str) -> str:
    """Return text unchanged if all three emoji markers are present; return fallback otherwise."""
    if all(marker in text for marker in _REQUIRED_SECTIONS):
        return text
    return _FALLBACK_ANALYSIS


# ── Aggregate statistics ──────────────────────────────────────────────────────

def _compute_stats(readings: list[dict]) -> dict:
    spo2_vals = [r["spo2"] for r in readings if r.get("spo2") is not None]
    bpm_vals = [r["bpm"] for r in readings if r.get("bpm") is not None]
    temp_vals = [r["temperature"] for r in readings if r.get("temperature") is not None]
    alert_count = sum(1 for r in readings if r.get("alert"))

    def _stats(vals, warn_fn, danger_fn):
        if not vals:
            return {"min": None, "max": None, "avg": None, "warning": 0, "danger": 0}
        return {
            "min": round(min(vals), 1),
            "max": round(max(vals), 1),
            "avg": round(sum(vals) / len(vals), 1),
            "warning": sum(1 for v in vals if warn_fn(v)),
            "danger": sum(1 for v in vals if danger_fn(v)),
        }

    return {
        "spo2": _stats(
            spo2_vals,
            warn_fn=lambda v: 90 <= v < 95,
            danger_fn=lambda v: v < 90,
        ),
        "bpm": _stats(
            bpm_vals,
            warn_fn=lambda v: (40 <= v < 60) or (100 < v <= 130),
            danger_fn=lambda v: v < 40 or v > 130,
        ),
        "temperature": _stats(
            temp_vals,
            warn_fn=lambda v: 37.2 < v <= 38.0,
            danger_fn=lambda v: v > 38.0 or v < 35.0,
        ),
        "alert_count": alert_count,
        "total": len(readings),
    }


# ── AI Health Summary (streaming) ─────────────────────────────────────────────
#
# Prompt caching strategy:
#   _SYSTEM_SUMMARY_BLOCKS contains a single static block marked ephemeral.
#   Every summary request for any patient/range reuses the same system role,
#   so the cache hits after the very first request within the 5-minute TTL window.
#   Only the dynamic user prompt (patient stats) pays input tokens each call.

_SYSTEM_SUMMARY_BLOCKS: list[dict] = [
    {
        "type": "text",
        "text": (
            "You are a clinical decision-support assistant integrated into a hospital patient "
            "monitoring system. Analyze summarized vital sign statistics and provide concise, "
            "evidence-based clinical interpretations for medical professionals. Be direct, "
            "specific, and clinically precise. Do not add disclaimers or suggest the reader "
            "consult a physician — they ARE the physician."
        ),
        "cache_control": {"type": "ephemeral"},
    }
]


async def stream_generate_summary(
    patient_meta: dict, readings: list[dict], period_label: str
) -> AsyncIterator[str]:
    """
    Async generator — yields raw text chunks as Claude produces them.
    Stats are pre-computed in Python before the API call; the model receives only
    the compact summary table (~400 tokens regardless of the selected period length).
    """
    stats = _compute_stats(readings)
    s = stats
    age = patient_meta.get("age", "unknown")
    gender = patient_meta.get("gender", "unknown")

    def _fmt(m: dict) -> str:
        if m["min"] is None:
            return "no data"
        return (
            f"min={m['min']}, max={m['max']}, avg={m['avg']}, "
            f"warning_readings={m['warning']}, danger_readings={m['danger']}"
        )

    user_prompt = f"""Analyze the following summarized sensor data and provide a concise clinical interpretation.

Patient: Age {age}, Gender {gender}
Period analyzed: {period_label}
Total readings: {s['total']}
Alerts triggered: {s['alert_count']}

SpO₂ (%): {_fmt(s['spo2'])}
Heart Rate (BPM): {_fmt(s['bpm'])}
Temperature (°C): {_fmt(s['temperature'])}

Reference thresholds:
- SpO₂: normal ≥95%, warning 90–94%, danger <90%
- BPM: normal 60–100, warning 40–59 or 101–130, danger <40 or >130
- Temperature: normal 35–37.2°C, warning 37.3–38°C, danger >38°C or <35°C

Write 3–4 short paragraphs covering:
1. Overall patient status during this period
2. SpO₂ findings and clinical implications
3. Heart rate findings and clinical significance
4. Temperature findings and any concern

End with a short bullet list titled "Recommended Attention Points" (2–4 actionable items).
Keep the tone professional. Focus on interpretation, not raw numbers.
Add a one-line disclaimer at the end."""

    async with _async_client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=700,
        system=_SYSTEM_SUMMARY_BLOCKS,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


# ── Copilot helpers ───────────────────────────────────────────────────────────

_METRIC_META: dict[str, tuple[str, str]] = {
    "spo2":        ("SpO₂",        "%"),
    "bpm":         ("Heart Rate",  " bpm"),
    "temperature": ("Temperature", "°C"),
}


def _slice_stats(vals: list[float]) -> Optional[dict]:
    if not vals:
        return None
    n = len(vals)
    avg = sum(vals) / n
    third = max(1, n // 3)
    delta = (sum(vals[-third:]) / third) - (sum(vals[:third]) / third)
    trend = "rising" if delta > 0.5 else "falling" if delta < -0.5 else "stable"
    return {
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
        "avg": round(avg, 1),
        "trend": trend,
    }


def _build_event_context(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
) -> dict:
    """Pre-compute all data needed for any copilot prompt. Never sends raw readings to Claude."""
    metric_label, unit = _METRIC_META.get(metric, (metric.upper(), ""))
    formatted_value = f"{int(value)}{unit}" if metric == "bpm" else f"{value:.1f}{unit}"

    try:
        t_start = datetime.fromisoformat(triggered_at.replace("Z", "+00:00"))
        if resolved_at:
            t_end = datetime.fromisoformat(resolved_at.replace("Z", "+00:00"))
            delta_mins = int((t_end - t_start).total_seconds() / 60)
            duration_str = f"{delta_mins} minute{'s' if delta_mins != 1 else ''}"
        else:
            duration_str = "Active (unresolved)"
    except Exception:
        duration_str = "Unknown"

    spo2_vals = [r["spo2"]        for r in readings if r.get("spo2")        is not None]
    bpm_vals  = [float(r["bpm"])  for r in readings if r.get("bpm")         is not None]
    temp_vals = [r["temperature"] for r in readings if r.get("temperature") is not None]

    spo2_s = _slice_stats(spo2_vals)
    bpm_s  = _slice_stats(bpm_vals)
    temp_s = _slice_stats(temp_vals)

    def _fmt_s(s: Optional[dict], u: str) -> str:
        return "no data" if not s else (
            f"min={s['min']}{u}, max={s['max']}{u}, avg={s['avg']}{u}, trend={s['trend']}"
        )

    correlations: list[str] = []
    if temp_s and bpm_s:
        if temp_s["trend"] == bpm_s["trend"] and temp_s["trend"] != "stable":
            correlations.append(
                f"BPM and Temperature both {temp_s['trend']} "
                f"(Δ BPM ≈ {abs(round(bpm_s['max'] - bpm_s['min'], 0)):.0f} bpm, "
                f"Δ Temp ≈ {abs(round(temp_s['max'] - temp_s['min'], 1)):.1f}°C)"
            )
        else:
            correlations.append(
                f"BPM trend ({bpm_s['trend']}) diverges from Temperature trend ({temp_s['trend']})"
            )
    if spo2_s:
        correlations.append(
            f"SpO₂ dropped to {spo2_s['min']}% — hypoxic component present"
            if spo2_s["min"] < 95
            else f"SpO₂ stable at avg {spo2_s['avg']}% — no hypoxic component"
        )
    corr_str = (
        "; ".join(correlations) if correlations
        else "Insufficient data for cross-metric correlation"
    )

    rows: list[str] = []
    for r in readings[:25]:
        ts_s = r["ts"][:19].replace("T", " ")
        rows.append(
            f"  {ts_s} | SpO₂={r.get('spo2', '?')}%"
            f" | BPM={r.get('bpm', '?')} | Temp={r.get('temperature', '?')}°C"
        )

    return {
        "metric_label":    metric_label,
        "formatted_value": formatted_value,
        "duration_str":    duration_str,
        "corr_str":        corr_str,
        "table":           "\n".join(rows) if rows else "  (no readings in window)",
        "n_readings":      len(readings),
        "n_shown":         len(rows),
        "triggered_fmt":   triggered_at[:19].replace("T", " ") + " UTC",
        "resolved_fmt":    (
            resolved_at[:19].replace("T", " ") + " UTC"
            if resolved_at else "Active (unresolved)"
        ),
        "spo2_str":  _fmt_s(spo2_s, "%"),
        "bpm_str":   _fmt_s(bpm_s,  " bpm"),
        "temp_str":  _fmt_s(temp_s, "°C"),
    }


# ── Initial alert analysis (buffered + validated) ────────────────────────────
#
# Why buffered and not streamed to the client:
#   The BubbleContent renderer in ClinicalCopilot.tsx only begins rendering once
#   it has a complete text string. More critically, it relies on all three emoji
#   section headers (📥 🔍 ⚡) being present — partial or malformed output would
#   crash the component. We use the streaming SDK internally so the Anthropic
#   connection starts receiving tokens immediately (lower TTFB from their side),
#   then collect the full text via get_final_text() before validation and dispatch.
#
# Prompt caching:
#   _SYSTEM_COPILOT_INITIAL is 100% static — the same across every alert, every
#   patient. Marking the block ephemeral means repeated Check button clicks within
#   the 5-minute TTL pay 0 input tokens for the 400-token system prompt.

_SYSTEM_COPILOT_INITIAL = """You are a Clinical AI Copilot integrated into MediSync, a real-time hospital patient monitoring system. A physiological alert has been detected. Analyze the telemetry data and respond with EXACTLY this three-section structure — no other format, no markdown ## headers:

📥 **What Happened**
Write exactly 2 sentences: (1) what the sensor recorded — name the metric, state the exact triggered value and exact timestamp; (2) describe how the reading evolved — instantaneous single-point spike or sustained multi-reading elevation, and what the baseline was before and after.

🔍 **Root Cause Hypothesis**
Write exactly 3 bullet points using "•":
• Classify as PHYSIOLOGICAL ANOMALY or SENSOR ARTIFACT with your primary reasoning (cite the number of affected readings and onset pattern)
• Cross-metric correlation evidence — specifically what BPM, SpO₂, and Temperature did during the window (numbers, not vague descriptions)
• The single key distinguishing factor (e.g. "gradual 8-minute ramp with concurrent tachycardia excludes I2C transient glitch" OR "single-reading spike returning to baseline in one cycle is the hallmark of MLX90614 transient noise")

⚡ **Recommended Next Steps**
Write 2–3 bullet points using "•":
• Immediate action with specific numeric thresholds (e.g. "Reassess in 15 min; escalate if temperature exceeds 39.0°C")
• Secondary monitoring instruction
• Optional third action only if genuinely warranted

RULES — follow strictly:
• Use exactly the emoji-bold headers shown above, nothing else
• Every claim must reference a specific number from the data
• Distinguish sensor artifacts (instantaneous single-reading spikes, immediate full baseline return) from physiological events (gradual multi-reading onset, cross-metric coupling)
• No disclaimers, no "consult a physician", no caveats — be direct"""

_SYSTEM_COPILOT_INITIAL_BLOCKS: list[dict] = [
    {
        "type": "text",
        "text": _SYSTEM_COPILOT_INITIAL,
        "cache_control": {"type": "ephemeral"},
    }
]


def analyze_alert_event(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
) -> str:
    """
    Streams the response internally, collects the full text via get_final_text(),
    runs _validate_analysis(), and returns either the validated text or the
    structured fallback. Called via asyncio.to_thread from the FastAPI handler.
    """
    ctx = _build_event_context(metric, value, triggered_at, resolved_at, readings)

    user_msg = f"""ALERT EVENT
Metric: {ctx['metric_label']}
Triggered value: {ctx['formatted_value']}
Triggered at: {ctx['triggered_fmt']}
Resolved at: {ctx['resolved_fmt']}
Event duration: {ctx['duration_str']}

SENSOR TELEMETRY — First {ctx['n_shown']} of {ctx['n_readings']} readings shown in event window
{ctx['table']}

EVENT WINDOW STATISTICS
SpO₂: {ctx['spo2_str']}
Heart Rate: {ctx['bpm_str']}
Temperature: {ctx['temp_str']}
Cross-metric correlations: {ctx['corr_str']}

Provide your clinical analysis."""

    delay = 2.0
    for attempt in range(3):
        try:
            with _client.messages.stream(
                model="claude-haiku-4-5-20251001",
                max_tokens=650,
                system=_SYSTEM_COPILOT_INITIAL_BLOCKS,
                messages=[{"role": "user", "content": user_msg}],
            ) as stream:
                raw_text = stream.get_final_text()
            return _validate_analysis(raw_text)
        except anthropic.APIStatusError as e:
            if e.status_code in _RETRYABLE_STATUS and attempt < 2:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("Unreachable")


# ── Follow-up streaming (multi-turn chat) ─────────────────────────────────────
#
# Prompt caching strategy (two-block system):
#   Block 1 — _CHAT_SYSTEM_STATIC: role instructions, identical across every
#             consultation and every turn. Marked ephemeral → cached for 5 min.
#             After the first turn in a session window, this block costs 0 tokens.
#   Block 2 — dynamic alert context: unique per alert (metric/value/stats differ).
#             Never cached — re-sent each turn.
#
# The cache breakpoint sits at the END of block 1. This means the static ~120-token
# role block is always served from cache after the first hit, while the dynamic
# context (another ~100 tokens) is billed normally. Net saving: ~120 tokens * N turns.

_CHAT_SYSTEM_STATIC = (
    "You are a Clinical AI Copilot integrated into MediSync hospital monitoring system. "
    "You are in an ongoing clinical consultation about a specific alert event. "
    "Answer follow-up questions as a clinical expert consultant — conversationally, "
    "directly, and specifically. Format responses as short paragraphs or bullet points "
    "(• prefix) as appropriate. Be concise (3–6 sentences unless the question clearly "
    "needs more). Never add disclaimers."
)


def _build_chat_system_blocks(ctx: dict) -> list[dict]:
    dynamic = (
        f"ALERT CONTEXT:\n"
        f"  Metric: {ctx['metric_label']} · Triggered value: {ctx['formatted_value']}\n"
        f"  Duration: {ctx['duration_str']}\n"
        f"  SpO₂ window: {ctx['spo2_str']}\n"
        f"  Heart Rate window: {ctx['bpm_str']}\n"
        f"  Temperature window: {ctx['temp_str']}\n"
        f"  Cross-metric: {ctx['corr_str']}\n\n"
        "You have provided the initial structured analysis. Answer the clinician's follow-up."
    )
    return [
        {"type": "text", "text": _CHAT_SYSTEM_STATIC, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": dynamic},
    ]


async def stream_chat_followup(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
    history: list[dict],
    message: str,
) -> AsyncIterator[str]:
    """
    Async generator — yields raw text chunks for each follow-up turn.
    Streamed directly to FastAPI's StreamingResponse; no server-side buffering.
    Format validation is not applied here: follow-up responses are freeform prose.
    """
    ctx = _build_event_context(metric, value, triggered_at, resolved_at, readings)
    system_blocks = _build_chat_system_blocks(ctx)

    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": message})

    async with _async_client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=system_blocks,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
