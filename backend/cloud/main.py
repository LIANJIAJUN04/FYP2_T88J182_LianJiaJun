import asyncio
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from database import close_session_by_id, get_last_reading_time, get_open_sessions
from routers import alerts, copilot, history, patients, sessions, stream, summary

logger = logging.getLogger(__name__)

# Sessions with no readings for this many seconds are auto-closed by the cloud watchdog.
_STALE_THRESHOLD_SECONDS = 180

app = FastAPI(title="MediSync Cloud API")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(stream.router)
app.include_router(history.router)
app.include_router(sessions.router)
app.include_router(alerts.router)
app.include_router(summary.router)
app.include_router(copilot.router)


async def _cloud_session_watchdog() -> None:
    """Close Supabase sessions whose ESP32 has stopped sending readings.

    Runs every 60 s.  For each open session (ended_at IS NULL), queries
    InfluxDB Cloud for the last reading time.  If no reading has arrived for
    more than _STALE_THRESHOLD_SECONDS, the session is closed with
    closed_reason = 'auto_timeout'.

    This is the cloud-side safety net for when the local bridge or local
    FastAPI is unreachable and cannot call POST /api/device/disconnect.
    """
    while True:
        await asyncio.sleep(60)
        try:
            open_sessions = await asyncio.to_thread(get_open_sessions)
            if not open_sessions:
                continue
            now = datetime.now(timezone.utc)
            for sess in open_sessions:
                patient_id = sess["patient_id"]
                session_id = sess["id"]
                started_at = sess["started_at"]
                try:
                    last_ts = await asyncio.to_thread(get_last_reading_time, patient_id)
                    if last_ts is None:
                        # No reading in the last 30 min — only close if session is old
                        # enough to rule out a brand-new session before first reading.
                        raw = started_at
                        if raw.endswith("Z"):
                            raw = raw[:-1] + "+00:00"
                        started = datetime.fromisoformat(raw)
                        if started.tzinfo is None:
                            started = started.replace(tzinfo=timezone.utc)
                        if (now - started).total_seconds() > _STALE_THRESHOLD_SECONDS:
                            logger.warning(
                                "[cloud watchdog] No readings in 30 min for patient %s — closing session %s",
                                patient_id, session_id,
                            )
                            await asyncio.to_thread(
                                close_session_by_id, session_id, started_at, "auto_timeout"
                            )
                    else:
                        elapsed = (now - last_ts).total_seconds()
                        if elapsed > _STALE_THRESHOLD_SECONDS:
                            logger.warning(
                                "[cloud watchdog] No reading for %.0fs for patient %s — closing session %s",
                                elapsed, patient_id, session_id,
                            )
                            await asyncio.to_thread(
                                close_session_by_id, session_id, started_at, "auto_timeout"
                            )
                except Exception as exc:
                    logger.error("[cloud watchdog] Error checking patient %s: %s", patient_id, exc)
        except Exception as exc:
            logger.error("[cloud watchdog] Outer error: %s", exc)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_cloud_session_watchdog())
    logger.info("[main] Cloud session watchdog started (threshold: %ds)", _STALE_THRESHOLD_SECONDS)


@app.get("/health")
async def health():
    return {"status": "ok"}
