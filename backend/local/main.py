import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from limiter import limiter
from routers import patients, readings, session, stream
from sync import cloud_sync_worker
from ml.predict import load_model

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
app.state.ml_model            = None   # populated at startup

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(patients.router)
app.include_router(session.router)
app.include_router(readings.router)
app.include_router(stream.router)


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    app.state.ml_model = await asyncio.to_thread(load_model)
    asyncio.create_task(cloud_sync_worker())


@app.get("/health")
async def health():
    return {"status": "ok"}
