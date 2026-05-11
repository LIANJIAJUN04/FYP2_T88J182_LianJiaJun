from fastapi import APIRouter, Depends, HTTPException

from auth import require_auth
from database import supabase

router = APIRouter()


@router.get("/api/patients")
async def list_patients(auth: dict = Depends(require_auth)):
    result = (
        supabase.table("patients")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str, auth: dict = Depends(require_auth)):
    result = (
        supabase.table("patients")
        .select("*")
        .eq("id", patient_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    return result.data[0]
