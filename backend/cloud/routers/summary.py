import asyncio
import json
import logging
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from auth import require_auth
from claude_service import stream_generate_summary
from database import get_history, supabase

router = APIRouter()
logger = logging.getLogger(__name__)

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
    """
    Streams the AI Health Summary as SSE. TTFB drops to <500ms.

    SSE event sequence:
      1. data: {"type": "meta", "period": "Last 24 hours", "readings_count": 1440}
      2. data: {"type": "chunk", "text": "..."}  — repeated until complete
      3. data: {"type": "done"}
      or:
         data: {"type": "error", "message": "..."}

    The meta event is emitted before the first Claude token so the frontend
    can display the period badge and reading count immediately while text streams in.
    """
    if range not in _RANGES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid range. Choose from: {', '.join(_RANGES)}",
        )

    period_label, delta = _RANGES[range]
    now = datetime.now(timezone.utc)
    start = (now - delta).strftime("%Y-%m-%dT%H:%M:%SZ")
    stop = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        patient_resp = (
            supabase.table("patients")
            .select("age, gender")
            .eq("id", patient_id)
            .single()
            .execute()
        )
        patient_meta = patient_resp.data or {}
    except Exception:
        patient_meta = {}

    try:
        readings = await asyncio.to_thread(get_history, patient_id, start, stop)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch readings: {e}")

    if len(readings) < 2:
        raise HTTPException(
            status_code=422,
            detail="Not enough data for this period. Try a longer time range.",
        )

    async def _generate():
        # Emit metadata first so the UI can show period/count while text arrives.
        yield f"data: {json.dumps({'type': 'meta', 'period': period_label, 'readings_count': len(readings)})}\n\n".encode()

        try:
            async for chunk in stream_generate_summary(patient_meta, readings, period_label):
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n".encode()

            yield f"data: {json.dumps({'type': 'done'})}\n\n".encode()

        except Exception as e:
            logger.error(
                "stream_generate_summary failed: %s\n%s", e, traceback.format_exc()
            )
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n".encode()

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
