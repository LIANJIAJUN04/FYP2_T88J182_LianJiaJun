import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import patients, session, readings, stream
from sync import cloud_sync_worker

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

app.include_router(patients.router)
app.include_router(session.router)
app.include_router(readings.router)
app.include_router(stream.router)


@app.on_event("startup")
async def startup():
    asyncio.create_task(cloud_sync_worker())


@app.get("/health")
async def health():
    return {"status": "ok"}
