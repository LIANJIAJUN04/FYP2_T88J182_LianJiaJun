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


# ── Copilot: single-event alert analysis ─────────────────────────────────────

_SYSTEM_COPILOT = """You are a biomedical expert system integrated into MediSync, a real-time hospital patient monitoring platform. Clinicians use your analysis for rapid bedside decision support — they are trained professionals who need precise, evidence-based reasoning.

Your task: analyze a single physiological alert event and its surrounding sensor telemetry.

MANDATORY OUTPUT FORMAT — use these exact section headers and keywords, no deviations:

## Clinical Event Analysis

**Metric:** [metric name · value · time]
**Duration:** [duration string]
**Signal:** [exactly one of: PHYSIOLOGICAL ANOMALY | SENSOR ARTIFACT | AMBIGUOUS]

[2–3 sentences justifying signal classification. For SENSOR ARTIFACT cite artifact signatures (single-reading spike, immediate baseline return, I2C transient). For PHYSIOLOGICAL ANOMALY cite multi-reading consistency, gradual onset, cross-metric correlations. For AMBIGUOUS state what would resolve it.]

## Physiological Reasoning

[2–3 sentences on the most probable clinical mechanism. Name specific pathophysiology (febrile tachycardia, hypoxic reflex, sympathetic activation). Cite exact values and cross-metric patterns.]

## Urgency

[exactly one of: ROUTINE | MONITOR | ESCALATE | IMMEDIATE] — [one sentence: specific action with numeric thresholds]

## Pattern Notes

• [quantitative trajectory, e.g. "Temperature: 37.2°C → 38.1°C over 8 readings (gradual ramp)"]
• [cross-metric correlation with numbers]
• [SpO₂ stability or change]
• [recovery or ongoing trend]

Do not add disclaimers, caveats, or "consult a physician" language. Be direct and specific."""


def _slice_stats(vals: list[float]) -> Optional[dict]:
    if not vals:
        return None
    n = len(vals)
    avg = sum(vals) / n
    third = max(1, n // 3)
    first_avg = sum(vals[:third]) / third
    last_avg = sum(vals[-third:]) / third
    delta = last_avg - first_avg
    trend = "rising" if delta > 0.5 else "falling" if delta < -0.5 else "stable"
    return {
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
        "avg": round(avg, 1),
        "trend": trend,
    }


def analyze_alert_event(
    metric: str,
    value: float,
    triggered_at: str,
    resolved_at: Optional[str],
    readings: list[dict],
) -> str:
    # ── Metric formatting ──────────────────────────────────────────
    _METRIC_META: dict[str, tuple[str, str]] = {
        "spo2":        ("SpO₂",       "%"),
        "bpm":         ("Heart Rate", " bpm"),
        "temperature": ("Temperature", "°C"),
    }
    metric_label, unit = _METRIC_META.get(metric, (metric.upper(), ""))
    if metric == "bpm":
        formatted_value = f"{int(value)}{unit}"
    else:
        formatted_value = f"{value:.1f}{unit}"

    # ── Duration ──────────────────────────────────────────────────
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

    # ── Stats for the in-window slice ─────────────────────────────
    spo2_vals  = [r["spo2"]        for r in readings if r.get("spo2")        is not None]
    bpm_vals   = [float(r["bpm"])  for r in readings if r.get("bpm")         is not None]
    temp_vals  = [r["temperature"] for r in readings if r.get("temperature") is not None]

    spo2_s = _slice_stats(spo2_vals)
    bpm_s  = _slice_stats(bpm_vals)
    temp_s = _slice_stats(temp_vals)

    def _fmt(s: Optional[dict], u: str) -> str:
        if not s:
            return "no data"
        return f"min={s['min']}{u}, max={s['max']}{u}, avg={s['avg']}{u}, trend={s['trend']}"

    # ── Cross-metric correlations ─────────────────────────────────
    correlations: list[str] = []
    if temp_s and bpm_s:
        if temp_s["trend"] == bpm_s["trend"] and temp_s["trend"] != "stable":
            d_bpm  = abs(round(bpm_s["max"]  - bpm_s["min"],  0))
            d_temp = abs(round(temp_s["max"] - temp_s["min"], 1))
            correlations.append(
                f"BPM and Temperature both {temp_s['trend']} (Δ BPM ≈ {d_bpm:.0f} bpm, Δ Temp ≈ {d_temp:.1f}°C)"
            )
        else:
            correlations.append(
                f"BPM trend ({bpm_s['trend']}) diverges from Temperature trend ({temp_s['trend']})"
            )
    if spo2_s:
        if spo2_s["min"] < 95:
            correlations.append(f"SpO₂ dropped to {spo2_s['min']}% — hypoxic component present")
        else:
            correlations.append(f"SpO₂ stable at avg {spo2_s['avg']}% — no hypoxic component")
    corr_str = "; ".join(correlations) if correlations else "Insufficient data for cross-metric correlation"

    # ── Telemetry table (capped at 25 rows) ───────────────────────
    rows: list[str] = []
    for r in readings[:25]:
        ts_s = r["ts"][:19].replace("T", " ")
        rows.append(
            f"  {ts_s} | SpO₂={r.get('spo2', '?')}% | BPM={r.get('bpm', '?')} | Temp={r.get('temperature', '?')}°C"
        )
    table = "\n".join(rows) if rows else "  (no readings in window — analysis based on alert event data only)"

    # ── User message ──────────────────────────────────────────────
    triggered_fmt = triggered_at[:19].replace("T", " ") + " UTC"
    resolved_fmt  = (resolved_at[:19].replace("T", " ") + " UTC") if resolved_at else "Active (unresolved)"

    user_msg = f"""ALERT EVENT
Metric: {metric_label}
Triggered value: {formatted_value}
Triggered at: {triggered_fmt}
Resolved at: {resolved_fmt}
Event duration: {duration_str}

SENSOR TELEMETRY — {len(readings)} readings in event window
{table}

EVENT WINDOW STATISTICS
SpO₂: {_fmt(spo2_s, '%')}
Heart Rate: {_fmt(bpm_s, ' bpm')}
Temperature: {_fmt(temp_s, '°C')}

Cross-metric correlations: {corr_str}

Analyze this alert event."""

    response = _create_with_retry(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=_SYSTEM_COPILOT,
        messages=[{"role": "user", "content": user_msg}],
    )
    return response.content[0].text
