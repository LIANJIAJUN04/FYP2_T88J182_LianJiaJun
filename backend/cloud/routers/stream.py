import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from auth import require_auth
from database import get_latest_reading

router = APIRouter()


@router.get("/api/patients/{patient_id}/stream")
async def stream(
    patient_id: str,
    request: Request,
    auth: dict = Depends(require_auth),
):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            try:
                reading = await asyncio.to_thread(get_latest_reading, patient_id)
                if reading:
                    yield f"data: {json.dumps(reading)}\n\n"
                else:
                    yield ": keep-alive\n\n"
            except Exception as e:
                print(f"[stream] InfluxDB query error: {e}")
                yield ": keep-alive\n\n"

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
