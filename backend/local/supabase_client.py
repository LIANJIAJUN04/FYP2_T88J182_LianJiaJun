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
