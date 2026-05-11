import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import alerts, history, patients, sessions, stream

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


@app.get("/health")
async def health():
    return {"status": "ok"}
