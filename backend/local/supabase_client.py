import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_url = os.getenv("SUPABASE_URL")
_key = os.getenv("SUPABASE_SERVICE_KEY")

client: Client = create_client(_url, _key)


def create_patient(
    name: str,
    ic_number: str,
    ward: str,
    age: int,
    gender: str,
    assigned_doctor: str,
) -> dict:
    result = client.table("patients").insert({
        "name": name,
        "ic_number": ic_number,
        "ward": ward,
        "age": age,
        "gender": gender,
        "assigned_doctor": assigned_doctor,
    }).execute()
    return result.data[0]


def get_patient_by_ic(ic_number: str) -> dict | None:
    result = client.table("patients").select("*").eq("ic_number", ic_number).execute()
    if result.data:
        return result.data[0]
    return None


def open_session(patient_id: str) -> str:
    # Mutual exclusion: forcefully close any ghost sessions before opening a new
    # one.  Without this, a patient who loses connection without logging out
    # accumulates dangling 'Active' rows on every subsequent login.
    close_active_session(patient_id, reason="device_disconnect")
    result = client.table("sessions").insert({"patient_id": patient_id}).execute()
    return result.data[0]["id"]


def close_active_session(patient_id: str, reason: str = "manual_logout") -> None:
    """Stamp ended_at, compute duration, and record the closure reason.

    Safe to call when no open session exists — silently returns.
    reason values: 'manual_logout' | 'device_disconnect' | 'auto_timeout'
    """
    open_rows = (
        client.table("sessions")
        .select("id, started_at")
        .eq("patient_id", patient_id)
        .is_("ended_at", "null")
        .execute()
    )
    if not open_rows.data:
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    for row in open_rows.data:
        raw = row["started_at"]
        # Supabase may return 'Z' suffix; fromisoformat() requires '+00:00'
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        started = datetime.fromisoformat(raw)
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        duration = max(0, int((now - started).total_seconds()))

        client.table("sessions").update({
            "ended_at": now_iso,
            "duration_seconds": duration,
            "closed_reason": reason,
        }).eq("id", row["id"]).execute()


def upsert_alert(patient_id: str, metric: str, value: float) -> bool:
    """Open a new alert row only if there is no existing unresolved alert for
    the same patient + metric.  Returns True if a new row was inserted (first
    occurrence), False if an unresolved alert already existed (duplicate)."""
    existing = (
        client.table("alerts")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("metric", metric)
        .is_("resolved_at", "null")
        .execute()
    )
    if existing.data:
        return False
    client.table("alerts").insert({
        "patient_id": patient_id,
        "metric": metric,
        "value": value,
    }).execute()
    return True


def resolve_alerts_for_patient(patient_id: str) -> None:
    """Stamp resolved_at on every open alert for this patient.
    Called when a reading is no longer in the danger/anomaly state."""
    now = datetime.now(timezone.utc).isoformat()
    client.table("alerts") \
        .update({"resolved_at": now}) \
        .eq("patient_id", patient_id) \
        .is_("resolved_at", "null") \
        .execute()
