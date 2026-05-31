#!/usr/bin/env python3
"""
simulate_outage.py — Standalone SQLite Cloud Sync Outage Demo
=============================================================
Demonstrates that MediSync's SQLite-backed queue survives an internet outage
without data loss and perfectly replays all buffered readings on recovery.

Three phases:
  Phase 1 — Normal operation   (5 readings  → cloud OK → SQLite count = 0)
  Phase 2 — Network outage     (10 readings → cloud BLOCKED → SQLite grows)
  Phase 3 — Recovery & replay  (10 readings → cloud OK again → SQLite = 0)

All helpers are re-implemented locally so the real sync.py is never touched.
Only demo rows (patient_id = DEMO_PATIENT_ID) are written; production data
in sync_queue.db is left untouched and demo rows are cleaned up on exit.

Run from backend/local/:
    python simulate_outage.py
"""

import json
import os
import sqlite3
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# ── ANSI colour helpers ──────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def _ok(msg):     print(f"  {GREEN}✔  {msg}{RESET}")
def _warn(msg):   print(f"  {YELLOW}⚠  {msg}{RESET}")
def _err(msg):    print(f"  {RED}✘  {msg}{RESET}")
def _info(msg):   print(f"  {CYAN}ℹ  {msg}{RESET}")
def _dim(msg):    print(f"  {DIM}{msg}{RESET}")

def _header(title: str):
    bar = "─" * 62
    print(f"\n{BOLD}{bar}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{bar}{RESET}\n")

# ── Paths & environment ──────────────────────────────────────────────────────
_HERE    = Path(__file__).parent
_DB_PATH = _HERE / "sync_queue.db"

load_dotenv(_HERE / ".env")

CLOUD_URL    = os.getenv("CLOUD_INFLUX_URL")
CLOUD_TOKEN  = os.getenv("CLOUD_INFLUX_TOKEN")
CLOUD_ORG    = os.getenv("CLOUD_INFLUX_ORG")
CLOUD_BUCKET = os.getenv("CLOUD_INFLUX_BUCKET")

# Clearly-labelled demo patient so we never confuse demo rows with real data
DEMO_PATIENT_ID = "DEMO-SUPERVISOR-TEST-001"

# Global toggle — set True to simulate outage, False to restore connection
_network_blocked: bool = False

# ── SQLite helpers (mirrors sync.py schema exactly) ──────────────────────────

def _init_db() -> None:
    """Create pending_sync table if it doesn't already exist."""
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


def _db_count_demo() -> int:
    """Count only demo patient rows — never counts production data."""
    con = sqlite3.connect(_DB_PATH)
    rows = con.execute("SELECT payload FROM pending_sync").fetchall()
    con.close()
    return sum(
        1 for (p,) in rows
        if json.loads(p).get("patient_id") == DEMO_PATIENT_ID
    )


def _db_load_demo_pending() -> list[tuple[int, dict]]:
    """Return all demo rows ordered by insertion time."""
    con = sqlite3.connect(_DB_PATH)
    rows = con.execute(
        "SELECT id, payload FROM pending_sync ORDER BY id"
    ).fetchall()
    con.close()
    return [
        (row_id, json.loads(p))
        for row_id, p in rows
        if json.loads(p).get("patient_id") == DEMO_PATIENT_ID
    ]


def _db_cleanup_demo() -> None:
    """Remove all demo rows — called at start and end so prod data stays clean."""
    con = sqlite3.connect(_DB_PATH)
    rows = con.execute("SELECT id, payload FROM pending_sync").fetchall()
    ids_to_delete = [
        row_id for row_id, p in rows
        if json.loads(p).get("patient_id") == DEMO_PATIENT_ID
    ]
    if ids_to_delete:
        placeholders = ",".join("?" * len(ids_to_delete))
        con.execute(
            f"DELETE FROM pending_sync WHERE id IN ({placeholders})",
            ids_to_delete,
        )
        con.commit()
    con.close()


# ── InfluxDB Cloud write (respects network toggle) ───────────────────────────

def _cloud_write(payload: dict) -> None:
    """
    Writes a single reading to InfluxDB Cloud.
    Raises ConnectionError when _network_blocked is True (simulated outage).
    """
    if _network_blocked:
        raise ConnectionError(
            "Simulated network outage — InfluxDB Cloud unreachable"
        )

    client    = InfluxDBClient(url=CLOUD_URL, token=CLOUD_TOKEN, org=CLOUD_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)

    point = (
        Point("health_readings")
        .tag("patient_id", payload["patient_id"])
        .field("bpm",         int(payload["bpm"]))
        .field("temperature", float(payload["temperature"]))
        .field("status",      payload["status"])
        .field("prediction",  payload["prediction"])
        .field("confidence",  float(payload.get("confidence", 0.0)))
        .field("alert",       bool(payload["alert"]))
        .time(payload["ts"],  WritePrecision.NS)
    )
    if payload.get("spo2") is not None:
        point = point.field("spo2", float(payload["spo2"]))

    write_api.write(bucket=CLOUD_BUCKET, org=CLOUD_ORG, record=point)
    client.close()


# ── Dummy reading factory ────────────────────────────────────────────────────

def _make_reading(index: int, offset_seconds: int = 0) -> dict:
    """Generate a realistic-looking vital-signs payload."""
    ts = datetime.now(timezone.utc) - timedelta(seconds=offset_seconds)
    return {
        "patient_id":  DEMO_PATIENT_ID,
        "spo2":        round(98.0 - index * 0.1, 1),
        "bpm":         75 + index,
        "temperature": 36.5,
        "status":      "normal",
        "prediction":  "normal",
        "confidence":  0.72,
        "alert":       False,
        "ts":          ts.isoformat(),
    }


# ── Demo entry point ─────────────────────────────────────────────────────────

def main() -> None:
    global _network_blocked

    # ── Banner ────────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'═' * 62}{RESET}")
    print(f"{BOLD}  MediSync — SQLite Cloud Sync Outage Simulation{RESET}")
    print(f"{BOLD}  FYP Demonstration  |  Dr. Subarmaniam Kannan{RESET}")
    print(f"{BOLD}{'─' * 62}{RESET}")
    print(f"{DIM}  Patient ID : {DEMO_PATIENT_ID}{RESET}")
    print(f"{DIM}  SQLite DB  : {_DB_PATH}{RESET}")
    print(f"{DIM}  Cloud      : {CLOUD_URL}{RESET}")
    print(f"{BOLD}{'═' * 62}{RESET}")

    _init_db()
    _db_cleanup_demo()   # ensure a clean slate; production rows untouched

    # =========================================================================
    # PHASE 1 — Normal Operation
    # =========================================================================
    _header("PHASE 1 — Normal Operation  (Network: ONLINE)")
    _info("Cloud connection is live. Writing 5 readings end-to-end.")
    _info("Expected behaviour: each reading syncs immediately → SQLite stays at 0.\n")

    _network_blocked = False

    for i in range(1, 6):
        reading = _make_reading(i, offset_seconds=(6 - i))
        row_id  = _db_insert(reading)          # 1. persist to SQLite first

        try:
            _cloud_write(reading)              # 2. write to cloud
            _db_delete(row_id)                 # 3. purge from SQLite on success
            _ok(
                f"Reading {i}/5  →  Cloud OK  │  "
                f"SpO₂={reading['spo2']}%  "
                f"BPM={reading['bpm']}  "
                f"Temp={reading['temperature']}°C"
            )
        except Exception as exc:
            _err(f"Reading {i}: unexpected error — {exc}")

        time.sleep(0.35)

    phase1_count = _db_count_demo()
    print()
    _ok(f"SQLite pending_sync  (demo rows) = {phase1_count}  ← queue fully drained")

    # =========================================================================
    # PHASE 2 — Internet Outage Simulation
    # =========================================================================
    _header("PHASE 2 — Internet Outage  (Network: OFFLINE)")
    _network_blocked = True
    _warn("Network cut — cloud writes will now fail.")
    _warn("Simulating 10 consecutive readings arriving from the ESP32.\n")
    _info("Each reading is PERSISTED to SQLite even though the cloud is unreachable.")
    _info("Watch the backlog grow...\n")

    for i in range(1, 11):
        reading = _make_reading(i, offset_seconds=0)
        row_id  = _db_insert(reading)          # always written to SQLite first

        try:
            _cloud_write(reading)              # will raise — row stays in SQLite
        except ConnectionError:
            pass                               # expected during outage

        count = _db_count_demo()
        bar   = f"{RED}{'█' * count}{RESET}"
        print(
            f"  {RED}✘{RESET}  Reading {i:>2} buffered  │  "
            f"Queue: {bar} {BOLD}{count}{RESET}"
        )
        time.sleep(0.4)

    # Print full table so supervisor can see every stored row
    print()
    pending = _db_load_demo_pending()
    _warn(f"SQLite backlog — {len(pending)} row(s) sitting on disk:\n")
    print(
        f"  {BOLD}{'ID':<6} {'BPM':>5} {'SpO₂':>6} {'Temp':>6}  "
        f"{'Status':<8} {'Timestamp'}{RESET}"
    )
    print(f"  {'─'*6} {'─'*5} {'─'*6} {'─'*6}  {'─'*8} {'─'*30}")
    for row_id, p in pending:
        print(
            f"  {row_id:<6} {p['bpm']:>5} "
            f"{p['spo2']:>5.1f}% "
            f"{p['temperature']:>5.1f}°C  "
            f"{p['status']:<8} {p['ts']}"
        )

    # =========================================================================
    # PHASE 3 — Network Restored  →  Replay & Drain
    # =========================================================================
    _header("PHASE 3 — Network Restored  →  Replay & Drain")
    _network_blocked = False
    _info("Network connection restored.")
    _info("Replaying all SQLite-buffered readings to InfluxDB Cloud...\n")

    pending = _db_load_demo_pending()
    synced  = 0

    for row_id, payload in pending:
        try:
            _cloud_write(payload)
            _db_delete(row_id)
            synced   += 1
            remaining = _db_count_demo()
            _ok(
                f"Row {row_id}  →  Cloud OK  │  "
                f"Queue remaining: {remaining}"
            )
        except Exception as exc:
            _err(f"Row {row_id} failed: {exc}")

        time.sleep(0.35)

    # ── Final verification ─────────────────────────────────────────────────────
    final_count = _db_count_demo()
    print(f"\n{BOLD}{'═' * 62}{RESET}")

    if final_count == 0:
        print(
            f"{BOLD}{GREEN}"
            f"  ✔  Verification Success: SQLite Queue fully drained (Count: 0).\n"
            f"     Cloud Sync Complete — {synced} buffered reading(s) replayed."
            f"{RESET}"
        )
    else:
        print(
            f"{BOLD}{RED}"
            f"  ✘  Warning: {final_count} row(s) still pending.\n"
            f"     Check CLOUD_INFLUX_TOKEN / CLOUD_INFLUX_URL in backend/local/.env."
            f"{RESET}"
        )

    print(f"{BOLD}{'═' * 62}{RESET}\n")

    _db_cleanup_demo()   # remove demo rows — production data untouched


if __name__ == "__main__":
    main()
