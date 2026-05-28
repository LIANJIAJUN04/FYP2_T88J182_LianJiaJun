import time
from datetime import datetime
from typing import Optional

import anthropic

# SDK auto-reads ANTHROPIC_API_KEY from environment; raises AuthenticationError at
# request time (not startup) if the key is missing or invalid.
_client = anthropic.Anthropic()

_RETRYABLE_STATUS = {529, 503, 500}


def _create_with_retry(
    model: str,
    max_tokens: int,
    messages: list,
    system: Optional[str] = None,
    max_retries: int = 3,
):
    delay = 2.0
    kwargs: dict = dict(model=model, max_tokens=max_tokens, messages=messages)
    if system:
        kwargs["system"] = system
    for attempt in range(max_retries):
        try:
            return _client.messages.create(**kwargs)
        except anthropic.APIStatusError as e:
            if e.status_code in _RETRYABLE_STATUS and attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("Unreachable")


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
            warn_fn=lambda v: v > 37.2 and v <= 38,
            danger_fn=lambda v: v > 38 or v < 35,
        ),
        "alert_count": alert_count,
        "total": len(readings),
    }


def generate_summary(patient_meta: dict, readings: list[dict], period_label: str) -> str:
    stats = _compute_stats(readings)
    s = stats

    age = patient_meta.get("age", "unknown")
    gender = patient_meta.get("gender", "unknown")

    def _fmt(metric_stats):
        m = metric_stats
        if m["min"] is None:
            return "no data"
        return (
            f"min={m['min']}, max={m['max']}, avg={m['avg']}, "
            f"warning_readings={m['warning']}, danger_readings={m['danger']}"
        )

    prompt = f"""You are a clinical decision-support assistant helping doctors understand patient vitals. Analyze the following summarized sensor data and provide a concise, plain-English clinical interpretation.

Patient: Age {age}, Gender {gender}
Period analyzed: {period_label}
Total readings: {s['total']}
Alerts triggered: {s['alert_count']}

SpO₂ (%): {_fmt(s['spo2'])}
Heart Rate (BPM): {_fmt(s['bpm'])}
Temperature (°C): {_fmt(s['temperature'])}

Reference thresholds used:
- SpO₂: normal ≥95%, warning 90–94%, danger <90%
- BPM: normal 60–100, warning 40–59 or 101–130, danger <40 or >130
- Temperature: normal 35–37.2°C, warning 37.3–38°C, danger >38°C or <35°C

Write 3–4 short paragraphs covering:
1. Overall patient status during this period
2. SpO₂ findings and what any low readings may clinically indicate
3. Heart rate findings and clinical significance
4. Temperature findings and any concern

End with a short bullet list titled "Recommended Attention Points" with 2–4 actionable items for the doctor.

Keep the tone professional and concise. Do not repeat raw numbers already shown above — focus on interpretation and clinical implications. Add a one-line disclaimer at the end."""

    response = _create_with_retry(
        model="claude-haiku-4-5-20251001",
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


# ── Copilot shared helpers ────────────────────────────────────────────────────

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

    spo2_vals = [r["spo2"]               for r in readings if r.get("spo2")        is not None]
    bpm_vals  = [float(r["bpm"])         for r in readings if r.get("bpm")         is not None]
    temp_vals = [r["temperature"]        for r in readings if r.get("temperature") is not None]

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
    corr_str = "; ".join(correlations) if correlations else "Insufficient data for cross-metric correlation"

    rows: list[str] = []
    for r in readings[:25]:
        ts_s = r["ts"][:19].replace("T", " ")
        rows.append(
            f"  {ts_s} | SpO₂={r.get('spo2', '?')}% "
            f"| BPM={r.get('bpm', '?')} | Temp={r.get('temperature', '?')}°C"
        )

    return {
        "metric_label":    metric_label,
        "formatted_value": formatted_value,
        "duration_str":    duration_str,
        "spo2_s":          spo2_s,
        "bpm_s":           bpm_s,
        "temp_s":          temp_s,
        "corr_str":        corr_str,
        "table":           "\n".join(rows) if rows else "  (no readings in window)",
        "n_readings":      len(readings),
        "triggered_fmt":   triggered_at[:19].replace("T", " ") + " UTC",
        "resolved_fmt":    (
            resolved_at[:19].replace("T", " ") + " UTC"
            if resolved_at else "Active (unresolved)"
        ),
        "spo2_str":  _fmt_s(spo2_s,  "%"),
        "bpm_str":   _fmt_s(bpm_s,   " bpm"),
        "temp_str":  _fmt_s(temp_s,  "°C"),
    }


# ── Initial alert analysis ─────────────────────────────────────────────────────

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


def analyze_alert_event(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
) -> str:
    ctx = _build_event_context(metric, value, triggered_at, resolved_at, readings)

    user_msg = f"""ALERT EVENT
Metric: {ctx['metric_label']}
Triggered value: {ctx['formatted_value']}
Triggered at: {ctx['triggered_fmt']}
Resolved at: {ctx['resolved_fmt']}
Event duration: {ctx['duration_str']}

SENSOR TELEMETRY — {ctx['n_readings']} readings in event window
{ctx['table']}

EVENT WINDOW STATISTICS
SpO₂: {ctx['spo2_str']}
Heart Rate: {ctx['bpm_str']}
Temperature: {ctx['temp_str']}
Cross-metric correlations: {ctx['corr_str']}

Provide your clinical analysis."""

    response = _create_with_retry(
        model="claude-haiku-4-5-20251001",
        max_tokens=550,
        system=_SYSTEM_COPILOT_INITIAL,
        messages=[{"role": "user", "content": user_msg}],
    )
    return response.content[0].text


# ── Follow-up conversation ────────────────────────────────────────────────────

def _build_chat_system(ctx: dict) -> str:
    """System prompt for follow-up turns — always includes the full event context."""
    return f"""You are a Clinical AI Copilot integrated into MediSync hospital monitoring system. You are in an ongoing clinical consultation about a specific alert event.

ALERT CONTEXT — always available for reference:
  Metric: {ctx['metric_label']} · Triggered value: {ctx['formatted_value']}
  Duration: {ctx['duration_str']}
  SpO₂ window: {ctx['spo2_str']}
  Heart Rate window: {ctx['bpm_str']}
  Temperature window: {ctx['temp_str']}
  Cross-metric: {ctx['corr_str']}

You have provided an initial structured analysis. Answer follow-up questions as a clinical expert consultant — conversationally, directly, and specifically. Format responses as short paragraphs or bullet points (• prefix) as appropriate. Be concise (3–6 sentences unless the question clearly needs more). Never add disclaimers."""


def chat_followup(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
    history: list[dict],
    message: str,
) -> str:
    ctx = _build_event_context(metric, value, triggered_at, resolved_at, readings)
    system = _build_chat_system(ctx)

    # Build Claude messages: full prior conversation + new user turn
    messages: list[dict] = [
        {"role": m["role"], "content": m["content"]}
        for m in history
    ]
    messages.append({"role": "user", "content": message})

    response = _create_with_retry(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=system,
        messages=messages,
    )
    return response.content[0].text
