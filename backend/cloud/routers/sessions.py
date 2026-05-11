from fastapi import APIRouter, Depends

from auth import require_auth
from database import supabase

router = APIRouter()


@router.get("/api/patients/{patient_id}/sessions")
async def get_patient_sessions(patient_id: str, auth: dict = Depends(require_auth)):
    result = (
        supabase.table("sessions")
        .select("*")
        .eq("patient_id", patient_id)
        .order("started_at", desc=True)
        .execute()
    )
    return result.data
