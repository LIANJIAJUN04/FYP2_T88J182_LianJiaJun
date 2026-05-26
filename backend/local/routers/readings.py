import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import write_reading
from limiter import limiter
from ml.predict import run_inference
from status import get_status
from supabase_client import insert_alert
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

    # ── Write Supabase alert rows ──────────────────────────────────────────
    if alert:
        alert_writes: list = []

        if health_status == "danger":
            # One row per metric that crossed a danger threshold
            if body.spo2 is not None and body.spo2 < 90:
                alert_writes.append(
                    asyncio.to_thread(insert_alert, patient_id, "spo2", body.spo2)
                )
            if body.bpm < 40 or body.bpm > 130:
                alert_writes.append(
                    asyncio.to_thread(insert_alert, patient_id, "bpm", float(body.bpm))
                )
            if body.temperature > 38 or body.temperature < 35:
                alert_writes.append(
                    asyncio.to_thread(insert_alert, patient_id, "temperature", body.temperature)
                )

        else:
            # ML-only anomaly — log the metric furthest from its normal midpoint
            deviations: dict[str, float] = {
                "bpm": abs(body.bpm - 80) / 20.0,          # normal midpoint 80, ±20 to warning
                "temperature": abs(body.temperature - 36.65) / 0.55,  # midpoint 36.65
            }
            if body.spo2 is not None:
                deviations["spo2"] = (97.5 - body.spo2) / 2.5  # low SpO2 is worse

            worst = max(deviations, key=deviations.get)
            worst_value = {
                "spo2": body.spo2,
                "bpm": float(body.bpm),
                "temperature": body.temperature,
            }[worst]
            alert_writes.append(
                asyncio.to_thread(insert_alert, patient_id, worst, worst_value)
            )

        if alert_writes:
            await asyncio.gather(*alert_writes)

    # ── Persist locally ────────────────────────────────────────────────────
    await asyncio.to_thread(
        write_reading,
        patient_id=patient_id,
        spo2=body.spo2,
        bpm=body.bpm,
        temperature=body.temperature,
        status=health_status,
        prediction=prediction,
        alert=alert,
    )

    enqueue_reading(
        patient_id=patient_id,
        spo2=body.spo2,
        bpm=body.bpm,
        temperature=body.temperature,
        status=health_status,
        prediction=prediction,
        alert=alert,
        ts=ts,
    )

    request.app.state.last_reading = {
        "spo2": body.spo2,
        "bpm": body.bpm,
        "temperature": body.temperature,
        "status": health_status,
        "prediction": prediction,
        "alert": alert,
        "ts": ts.isoformat(),
    }

    return {
        "status": "ok",
        "health_status": health_status,
        "prediction": prediction,
        "alert": alert,
    }
