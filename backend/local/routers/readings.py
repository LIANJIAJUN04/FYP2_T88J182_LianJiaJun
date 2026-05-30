import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from database import write_reading
from limiter import limiter
from ml.predict import run_inference
from notifications import notify_alert
from status import get_status
from supabase_client import upsert_alert, resolve_alerts_for_patient
from sync import enqueue_reading

router = APIRouter()

_device_secret = os.getenv("DEVICE_SECRET", "")


class ReadingIn(BaseModel):
    spo2: float | None = None
    bpm: int
    temperature: float
    timestamp: int | None = None


@router.post("/api/readings")
@limiter.limit("5/second")
async def receive_reading(body: ReadingIn, request: Request):
    secret = request.headers.get("X-Device-Secret", "")
    if secret != _device_secret:
        raise HTTPException(status_code=403, detail="Invalid device secret")

    patient_id = request.app.state.active_patient_id
    if not patient_id:
        raise HTTPException(status_code=400, detail="No active patient")

    # ── Rule-based status ──────────────────────────────────────────────────
    health_status = get_status(body.spo2, body.bpm, body.temperature)

    # ── ML anomaly detection ───────────────────────────────────────────────
    ml_result = await asyncio.to_thread(
        run_inference,
        request.app.state.ml_model,
        body.bpm,
        body.temperature,
        body.spo2,
    )
    prediction: str = ml_result["prediction"]
    confidence: float = ml_result["confidence"]

    # Safety override: extreme values (e.g. temp 30°C) are out-of-distribution
    # for the ML model — it was trained on in-range vitals and cannot reliably
    # classify severe hypothermia/bradycardia/hypoxia.  When the rule-based
    # engine already declares DANGER, the ML badge must agree — showing "NORMAL"
    # alongside a DANGER status is clinically misleading.
    if health_status == "danger" and prediction == "normal":
        prediction = "anomaly"
        confidence = round(1.0 - confidence, 4)  # flip to P(anomaly)

    # alert = danger threshold breached OR ML flagged an anomaly
    alert = health_status == "danger" or prediction == "anomaly"

    ts = datetime.now(timezone.utc)

    # ── Write Supabase alert rows (session-style — one row per event, not per second) ──
    # alert_meta tracks (metric, value, alert_type) in parallel with alert_writes so
    # we can identify which upserts created NEW rows (return True) and notify on those.
    new_alert_events: list[tuple[str, float, str]] = []

    if alert:
        alert_writes: list = []
        alert_meta:   list[tuple[str, float, str]] = []

        if health_status == "danger":
            # One alert per metric that crossed a danger threshold.
            # upsert_alert returns True only when a new row is inserted;
            # it returns False when an unresolved alert already exists (no flood).
            if body.spo2 is not None and body.spo2 < 90:
                alert_writes.append(asyncio.to_thread(upsert_alert, patient_id, "spo2", body.spo2))
                alert_meta.append(("spo2", body.spo2, "danger"))
            if body.bpm < 40 or body.bpm > 130:
                alert_writes.append(asyncio.to_thread(upsert_alert, patient_id, "bpm", float(body.bpm)))
                alert_meta.append(("bpm", float(body.bpm), "danger"))
            if body.temperature > 38 or body.temperature < 35:
                alert_writes.append(asyncio.to_thread(upsert_alert, patient_id, "temperature", body.temperature))
                alert_meta.append(("temperature", body.temperature, "danger"))

        else:
            # ML-only anomaly — log the metric furthest from its normal midpoint
            deviations: dict[str, float] = {
                "bpm":         abs(body.bpm - 80) / 20.0,
                "temperature": abs(body.temperature - 36.65) / 0.55,
            }
            if body.spo2 is not None:
                deviations["spo2"] = (97.5 - body.spo2) / 2.5

            worst = max(deviations, key=deviations.get)
            worst_value = {
                "spo2":        body.spo2,
                "bpm":         float(body.bpm),
                "temperature": body.temperature,
            }[worst]
            alert_writes.append(asyncio.to_thread(upsert_alert, patient_id, worst, worst_value))
            alert_meta.append((worst, worst_value, "anomaly"))

        if alert_writes:
            results: list[bool] = await asyncio.gather(*alert_writes)
            new_alert_events = [
                meta for meta, is_new in zip(alert_meta, results) if is_new
            ]

    else:
        # Reading is safe — close any open alerts so resolved_at is stamped
        await asyncio.to_thread(resolve_alerts_for_patient, patient_id)

    # ── Persist locally ────────────────────────────────────────────────────
    await asyncio.to_thread(
        write_reading,
        patient_id=patient_id,
        spo2=body.spo2,
        bpm=body.bpm,
        temperature=body.temperature,
        status=health_status,
        prediction=prediction,
        confidence=confidence,
        alert=alert,
    )

    # ── Enqueue cloud sync ─────────────────────────────────────────────────
    enqueue_reading(
        patient_id=patient_id,
        spo2=body.spo2,
        bpm=body.bpm,
        temperature=body.temperature,
        status=health_status,
        prediction=prediction,
        confidence=confidence,
        alert=alert,
        ts=ts,
    )

    # ── Fire-and-forget notifications for newly opened alerts ─────────────
    if new_alert_events:
        patient_name: str = request.app.state.active_patient_name or "Unknown Patient"
        for metric, value, alert_type in new_alert_events:
            asyncio.create_task(
                notify_alert(patient_name, patient_id, metric, value, alert_type)
            )

    # ── Stamp heartbeat for the disconnect watchdog ────────────────────────
    request.app.state.last_reading_at = ts

    # ── Update in-memory SSE state ─────────────────────────────────────────
    request.app.state.last_reading = {
        "spo2": body.spo2,
        "bpm": body.bpm,
        "temperature": body.temperature,
        "status": health_status,
        "prediction": prediction,
        "confidence": confidence,
        "alert": alert,
        "ts": ts.isoformat(),
    }

    return {
        "status": "ok",
        "health_status": health_status,
        "prediction": prediction,
        "confidence": confidence,
        "alert": alert,
    }
