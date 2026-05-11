import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import write_reading
from status import get_status
from sync import enqueue_reading

router = APIRouter()

_device_secret = os.getenv("DEVICE_SECRET", "")


class ReadingIn(BaseModel):
    spo2: float
    bpm: int
    temperature: float
    timestamp: int | None = None


@router.post("/api/readings")
async def receive_reading(body: ReadingIn, request: Request):
    secret = request.headers.get("X-Device-Secret", "")
    if secret != _device_secret:
        raise HTTPException(status_code=403, detail="Invalid device secret")

    patient_id = request.app.state.active_patient_id
    if not patient_id:
        raise HTTPException(status_code=400, detail="No active patient")

    health_status = get_status(body.spo2, body.bpm, body.temperature)
    prediction = "normal"
    alert = health_status == "danger"

    ts = datetime.now(timezone.utc)

    write_reading(
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
