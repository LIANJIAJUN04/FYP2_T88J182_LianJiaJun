"""
Async cloud sync worker with SQLite-backed persistence.

Flow:
  - enqueue_reading() writes the payload to SQLite, then puts it on the
    in-memory asyncio.Queue.
  - cloud_sync_worker() loads any rows that were pending before the last
    restart (crash-recovery), then processes the queue continuously.
  - On a successful cloud write the SQLite row is deleted.
  - On failure the item is re-queued with a 5-second back-off; the SQLite
    row stays until it eventually succeeds.
"""

import asyncio
import json
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

_url    = os.getenv("CLOUD_INFLUX_URL")
_token  = os.getenv("CLOUD_INFLUX_TOKEN")
_org    = os.getenv("CLOUD_INFLUX_ORG")
_bucket = os.getenv("CLOUD_INFLUX_BUCKET")

# SQLite file lives alongside this module
_DB_PATH = Path(__file__).parent / "sync_queue.db"

sync_queue: asyncio.Queue = asyncio.Queue()

# ---------------------------------------------------------------------------
# SQLite helpers (all synchronous — called via asyncio.to_thread where needed)
# ---------------------------------------------------------------------------

def _init_db() -> None:
    """Create the pending_sync table if it doesn't exist."""
    con = sqlite3.connect(_DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS pending_sync (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            payload    TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    con.commit()
    con.close()


def _db_insert(payload: dict) -> int:
    """Persist a reading payload; returns the new row id."""
    con = sqlite3.connect(_DB_PATH)
    cur = con.execute(
        "INSERT INTO pending_sync (payload) VALUES (?)",
        (json.dumps(payload),),
    )
    row_id = cur.lastrowid
    con.commit()
    con.close()
    return row_id


def _db_delete(row_id: int) -> None:
    """Remove a row after a successful cloud write."""
    con = sqlite3.connect(_DB_PATH)
    con.execute("DELETE FROM pending_sync WHERE id = ?", (row_id,))
    con.commit()
    con.close()


def _db_load_pending() -> list[tuple[int, dict]]:
    """Return all rows not yet synced (e.g. after a restart)."""
    con = sqlite3.connect(_DB_PATH)
    rows = con.execute(
        "SELECT id, payload FROM pending_sync ORDER BY id"
    ).fetchall()
    con.close()
    return [(row_id, json.loads(p)) for row_id, p in rows]


# ---------------------------------------------------------------------------
# InfluxDB helpers
# ---------------------------------------------------------------------------

def _payload_to_point(p: dict) -> Point:
    point = (
        Point("health_readings")
        .tag("patient_id", p["patient_id"])
        .field("bpm", int(p["bpm"]))
        .field("temperature", float(p["temperature"]))
        .field("status", p["status"])
        .field("prediction", p["prediction"])
        .field("confidence", float(p.get("confidence", 0.0)))
        .field("alert", bool(p["alert"]))
        .time(p["ts"], WritePrecision.NS)
    )
    if p.get("spo2") is not None:
        point = point.field("spo2", float(p["spo2"]))
    return point


def _write_to_cloud(point: Point) -> None:
    client = InfluxDBClient(url=_url, token=_token, org=_org)
    write_api = client.write_api(write_options=SYNCHRONOUS)
    write_api.write(bucket=_bucket, org=_org, record=point)
    client.close()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Initialise the DB at import time so enqueue_reading() can always insert rows
# even before the async worker has started.
_init_db()


async def cloud_sync_worker() -> None:
    # Reload readings that were queued before the last server restart
    pending = await asyncio.to_thread(_db_load_pending)
    if pending:
        print(f"[sync] Resuming {len(pending)} pending reading(s) from SQLite")
        for row_id, payload in pending:
            await sync_queue.put((row_id, payload))

    print("[sync] Cloud sync worker started")
    while True:
        row_id, payload = await sync_queue.get()
        point = _payload_to_point(payload)
        try:
            await asyncio.to_thread(_write_to_cloud, point)
            await asyncio.to_thread(_db_delete, row_id)
            print("[sync] Cloud write ok")
        except Exception as e:
            print(f"[sync] Cloud write failed: {e} — retrying in 5s")
            await sync_queue.put((row_id, payload))
            await asyncio.sleep(5)


def enqueue_reading(
    patient_id: str,
    spo2: float | None,
    bpm: int,
    temperature: float,
    status: str,
    prediction: str,
    confidence: float,
    alert: bool,
    ts,
) -> None:
    """Persist to SQLite and enqueue for cloud sync."""
    payload = {
        "patient_id": patient_id,
        "spo2": spo2,
        "bpm": int(bpm),
        "temperature": float(temperature),
        "status": status,
        "prediction": prediction,
        "confidence": float(confidence),
        "alert": bool(alert),
        "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
    }
    row_id = _db_insert(payload)
    sync_queue.put_nowait((row_id, payload))
