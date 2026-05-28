"""
Device lifecycle router.

POST /api/device/disconnect
  Called by the bridge (serial or MQTT) the moment it detects the ESP32 has
  gone offline.  Immediately closes the active session so the session log
  reflects the true end-time rather than waiting for the heartbeat watchdog.
"""

import asyncio
import logging

from fastapi import APIRouter, Request

from supabase_client import close_active_session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/device/disconnect")
async def device_disconnect(request: Request):
    patient_id = request.app.state.active_patient_id

    if patient_id:
        logger.info("[device] Disconnect event — closing session for %s", patient_id)
        await asyncio.to_thread(close_active_session, patient_id, "device_disconnect")
        request.app.state.active_patient_id   = None
        request.app.state.active_patient_name = None
        request.app.state.last_reading        = None
        request.app.state.last_reading_at     = None
    else:
        logger.debug("[device] Disconnect event received but no active session")

    return {"status": "session_closed", "patient_id": patient_id}
