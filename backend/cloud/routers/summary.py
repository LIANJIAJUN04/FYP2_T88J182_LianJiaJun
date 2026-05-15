import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_auth

logger = logging.getLogger(__name__)
from claude_service import generate_summary
from database import get_history, supabase

router = APIRouter()

_RANGES = {
    "1h":  ("Last 1 hour",   timedelta(hours=1)),
    "6h":  ("Last 6 hours",  timedelta(hours=6)),
    "24h": ("Last 24 hours", timedelta(hours=24)),
    "7d":  ("Last 7 days",   timedelta(days=7)),
}


@router.get("/api/patients/{patient_id}/summary")
async def get_patient_summary(
    patient_id: str,
    range: str = Query(default="24h"),
    auth: dict = Depends(require_auth),
):
    if range not in _RANGES:
        raise HTTPException(status_code=400, detail=f"Invalid range. Choose from: {', '.join(_RANGES)}")

    period_label, delta = _RANGES[range]
    now = datetime.now(timezone.utc)
    start = (now - delta).strftime("%Y-%m-%dT%H:%M:%SZ")
    stop = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        patient_resp = supabase.table("patients").select("age, gender").eq("id", patient_id).single().execute()
        patient_meta = patient_resp.data or {}
    except Exception:
        patient_meta = {}

    try:
        readings = await asyncio.to_thread(get_history, patient_id, start, stop)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch readings: {e}")

    if len(readings) < 2:
        raise HTTPException(status_code=422, detail="Not enough data for this period. Try a longer time range.")

    try:
        summary_text = await asyncio.to_thread(generate_summary, patient_meta, readings, period_label)
    except Exception as e:
        logger.error("generate_summary failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI summary failed: {e}")

    return {
        "summary": summary_text,
        "period": period_label,
        "readings_count": len(readings),
    }
