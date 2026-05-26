import asyncio
import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import patients, session, readings, stream
from sync import cloud_sync_worker
from ml.predict import load_model

logger = logging.getLogger(__name__)

app = FastAPI(title="MediSync Local API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.active_patient_id = None
app.state.active_patient_name = None
app.state.last_reading = None
app.state.ml_model = None  # populated at startup

app.include_router(patients.router)
app.include_router(session.router)
app.include_router(readings.router)
app.include_router(stream.router)


@app.on_event("startup")
async def startup():
    asyncio.create_task(cloud_sync_worker())
    # Load ML model in a thread so the event loop isn't blocked
    app.state.ml_model = await asyncio.to_thread(load_model)
    if app.state.ml_model:
        logger.info("[main] ML model loaded — anomaly detection active")
    else:
        logger.warning("[main] ML model not loaded — predictions default to 'normal'")


@app.get("/health")
async def health():
    return {"status": "ok", "ml_loaded": app.state.ml_model is not None}
