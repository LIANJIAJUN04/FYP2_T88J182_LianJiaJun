from fastapi import APIRouter, Depends

from auth import require_auth
from database import supabase

router = APIRouter()


@router.get("/api/alerts")
async def get_alerts(auth: dict = Depends(require_auth)):
    result = (
        supabase.table("alerts")
        .select("*, patients(name, ic_number, ward)")
        .order("triggered_at", desc=True)
        .execute()
    )
    return result.data
