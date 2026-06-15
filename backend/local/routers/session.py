import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from supabase_client import get_patient_by_ic, open_session, close_active_session

router = APIRouter()

_nurse_password = os.getenv("NURSE_PASSWORD", "")


class LoginIn(BaseModel):
    ic_number: str
    password: str


@router.post("/api/session/login")
async def login(body: LoginIn, request: Request):
    if body.password != _nurse_password:
        raise HTTPException(status_code=401, detail="Invalid nurse password")

    patient = get_patient_by_ic(body.ic_number)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    open_session(patient["id"])

    request.app.state.active_patient_id   = patient["id"]
    request.app.state.active_patient_name = patient["name"]
    request.app.state.device_disconnected = False

    return {"patient_id": patient["id"], "name": patient["name"], "status": "ok"}


@router.post("/api/session/logout")
async def logout(request: Request):
    patient_id = request.app.state.active_patient_id
    if patient_id:
        close_active_session(patient_id, reason="manual_logout")
    request.app.state.active_patient_id   = None
    request.app.state.active_patient_name = None
    request.app.state.last_reading        = None
    request.app.state.last_reading_at     = None
    return {"status": "logged_out"}


@router.get("/api/session/active")
async def active_session(request: Request):
    patient_id = request.app.state.active_patient_id
    if not patient_id:
        return {"patient_id": None}
    return {
        "patient_id": patient_id,
        "name": request.app.state.active_patient_name,
    }
