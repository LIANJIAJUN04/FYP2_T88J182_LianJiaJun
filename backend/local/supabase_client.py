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
    result = client.table("sessions").insert({"patient_id": patient_id}).execute()
    return result.data[0]["id"]


def close_active_session(patient_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    client.table("sessions") \
        .update({"ended_at": now}) \
        .eq("patient_id", patient_id) \
        .is_("ended_at", "null") \
        .execute()


def upsert_alert(patient_id: str, metric: str, value: float) -> None:
    """Open a new alert row only if there is no existing unresolved alert for
    the same patient + metric.  This prevents one row per second flooding."""
    existing = (
        client.table("alerts")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("metric", metric)
        .is_("resolved_at", "null")
        .execute()
    )
    if not existing.data:
        client.table("alerts").insert({
            "patient_id": patient_id,
            "metric": metric,
            "value": value,
        }).execute()


def resolve_alerts_for_patient(patient_id: str) -> None:
    """Stamp resolved_at on every open alert for this patient.
    Called when a reading is no longer in the danger/anomaly state."""
    now = datetime.now(timezone.utc).isoformat()
    client.table("alerts") \
        .update({"resolved_at": now}) \
        .eq("patient_id", patient_id) \
        .is_("resolved_at", "null") \
        .execute()
