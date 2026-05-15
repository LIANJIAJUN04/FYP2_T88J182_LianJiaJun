import anthropic

# SDK auto-reads ANTHROPIC_API_KEY from environment; raises AuthenticationError at
# request time (not startup) if the key is missing or invalid.
_client = anthropic.Anthropic()


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

    response = _client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
