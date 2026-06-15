import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/api/stream")
async def stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            reading = request.app.state.last_reading
            if reading:
                yield f"data: {json.dumps(reading)}\n\n"
            elif request.app.state.device_disconnected:
                yield 'data: {"status":"disconnected"}\n\n'
            else:
                yield ": keep-alive\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
