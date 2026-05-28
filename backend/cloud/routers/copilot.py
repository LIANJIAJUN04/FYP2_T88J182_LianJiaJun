import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import require_auth
from claude_service import analyze_alert_event, stream_chat_followup

logger = logging.getLogger(__name__)
router = APIRouter()


class ReadingPoint(BaseModel):
    ts: str
    spo2: float
    bpm: float
    temperature: float


# ── /api/copilot/analyze — buffered initial analysis (JSON) ──────────────────
# Must return JSON, not SSE: the frontend BubbleContent renderer requires the
# complete text before it can validate and render the three-section structure.

class CopilotRequest(BaseModel):
    metric: str
    value: float
    triggered_at: str
    resolved_at: Optional[str] = None
    readings_slice: list[ReadingPoint] = []


class CopilotResponse(BaseModel):
    analysis: str
    readings_count: int


@router.post("/api/copilot/analyze", response_model=CopilotResponse)
async def analyze_alert(
    req: CopilotRequest,
    _auth: dict = Depends(require_auth),
):
    readings = [r.model_dump() for r in req.readings_slice]
    try:
        analysis = await asyncio.to_thread(
            analyze_alert_event,
            metric=req.metric,
            value=req.value,
            triggered_at=req.triggered_at,
            resolved_at=req.resolved_at,
            readings=readings,
        )
    except Exception as e:
        logger.error("Copilot analysis failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    return CopilotResponse(analysis=analysis, readings_count=len(readings))


# ── /api/copilot/chat — streaming follow-up (SSE) ────────────────────────────

class ConversationMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class CopilotChatRequest(BaseModel):
    metric: str
    value: float
    triggered_at: str
    resolved_at: Optional[str] = None
    readings_slice: list[ReadingPoint] = []
    history: list[ConversationMessage] = []
    message: str


async def _chat_sse_generator(req: CopilotChatRequest):
    """
    Wraps stream_chat_followup as an SSE byte stream.

    Event format:
      data: {"type": "chunk", "text": "..."}   — one text fragment from the model
      data: {"type": "done"}                    — stream completed successfully
      data: {"type": "error", "message": "..."}— unrecoverable error mid-stream

    The generator never raises; errors are surfaced as a typed SSE event so the
    frontend can display a graceful in-bubble error rather than a broken stream.
    """
    readings = [r.model_dump() for r in req.readings_slice]
    history = [{"role": m.role, "content": m.content} for m in req.history]

    try:
        async for chunk in stream_chat_followup(
            metric=req.metric,
            value=req.value,
            triggered_at=req.triggered_at,
            resolved_at=req.resolved_at,
            readings=readings,
            history=history,
            message=req.message,
        ):
            yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n".encode()

        yield f"data: {json.dumps({'type': 'done'})}\n\n".encode()

    except Exception as e:
        logger.error("Copilot chat stream error: %s", e)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n".encode()


@router.post("/api/copilot/chat")
async def chat_with_copilot(
    req: CopilotChatRequest,
    _auth: dict = Depends(require_auth),
):
    """
    Streams follow-up responses as SSE. TTFB drops to <500ms (first token from Haiku).
    X-Accel-Buffering: no disables nginx proxy buffering on Railway so chunks
    reach the browser immediately rather than being held until the buffer fills.
    """
    return StreamingResponse(
        _chat_sse_generator(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
