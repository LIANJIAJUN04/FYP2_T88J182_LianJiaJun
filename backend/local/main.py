import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from limiter import limiter
from routers import patients, readings, session, stream
from routers.device import router as device_router
from sync import cloud_sync_worker
from ml.predict import load_model
from supabase_client import close_active_session

# Sessions auto-close after this many seconds of silence from the device.
# This is a safety-net for cases where the bridge process itself crashes
# without posting /api/device/disconnect.  The MQTT LWT path fires first
# and will typically close the session well before this threshold.
_DEVICE_TIMEOUT_SECONDS = 300

app = FastAPI(title="MediSync Local API")

# ── Rate limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── App state ─────────────────────────────────────────────────────────────────
app.state.active_patient_id   = None
app.state.active_patient_name = None
app.state.last_reading        = None
app.state.last_reading_at     = None   # datetime of last valid reading; drives watchdog
app.state.device_disconnected = False  # True after LWT/disconnect until next session login
app.state.ml_model            = None   # populated at startup

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(patients.router)
app.include_router(session.router)
app.include_router(readings.router)
app.include_router(stream.router)
app.include_router(device_router)


# ── Background tasks ──────────────────────────────────────────────────────────

async def _heartbeat_watchdog() -> None:
    """Close the active session when no reading arrives within the timeout.

    Runs every 10 s.  The 5-minute timeout is intentionally generous so that
    brief sensor pauses (nurse adjusting probe) do not terminate the session.
    Immediate disconnects are handled by the bridge posting /api/device/disconnect.
    """
    while True:
        await asyncio.sleep(10)
        patient_id = app.state.active_patient_id
        last_ts: datetime | None = app.state.last_reading_at
        if patient_id and last_ts:
            elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
            if elapsed > _DEVICE_TIMEOUT_SECONDS:
                logger.warning(
                    "[watchdog] No reading for %.0fs — auto-closing session for %s",
                    elapsed,
                    patient_id,
                )
                await asyncio.to_thread(close_active_session, patient_id, "auto_timeout")
                app.state.active_patient_id   = None
                app.state.active_patient_name = None
                app.state.last_reading        = None
                app.state.last_reading_at     = None
                app.state.device_disconnected = True


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    app.state.ml_model = await asyncio.to_thread(load_model)
    asyncio.create_task(cloud_sync_worker())
    asyncio.create_task(_heartbeat_watchdog())
    if app.state.ml_model:
        logger.info("[main] ML model loaded — anomaly detection active")
    else:
        logger.warning("[main] ML model not loaded — predictions default to 'normal'")


@app.get("/health")
async def health():
    return {"status": "ok", "ml_loaded": app.state.ml_model is not None}
