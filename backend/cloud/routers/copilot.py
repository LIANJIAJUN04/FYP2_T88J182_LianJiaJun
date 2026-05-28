import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth
from claude_service import analyze_alert_event, chat_followup

logger = logging.getLogger(__name__)
router = APIRouter()


class ReadingPoint(BaseModel):
    ts: str
    spo2: float
    bpm: float
    temperature: float


# ── /api/copilot/analyze — initial structured analysis ───────────────────────

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


# ── /api/copilot/chat — multi-turn follow-up conversation ───────────────────

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


class CopilotChatResponse(BaseModel):
    response: str


@router.post("/api/copilot/chat", response_model=CopilotChatResponse)
async def chat_with_copilot(
    req: CopilotChatRequest,
    _auth: dict = Depends(require_auth),
):
    readings = [r.model_dump() for r in req.readings_slice]
    history  = [{"role": m.role, "content": m.content} for m in req.history]
    try:
        response_text = await asyncio.to_thread(
            chat_followup,
            metric=req.metric,
            value=req.value,
            triggered_at=req.triggered_at,
            resolved_at=req.resolved_at,
            readings=readings,
            history=history,
            message=req.message,
        )
    except Exception as e:
        logger.error("Copilot chat failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")
    return CopilotChatResponse(response=response_text)
