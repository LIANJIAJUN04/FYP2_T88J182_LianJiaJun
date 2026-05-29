from datetime import datetime, timezone

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


@router.put("/api/alerts/resolve-all/{patient_id}")
async def resolve_all_alerts(patient_id: str, auth: dict = Depends(require_auth)):
    """Soft-resolve all active (unresolved) alerts for a patient.

    Sets resolved_at on every row where resolved_at IS NULL.
    No rows are deleted — the audit trail is preserved in full.
    """
    resolved_at = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("alerts")
        .update({"resolved_at": resolved_at})
        .eq("patient_id", patient_id)
        .is_("resolved_at", "null")
        .execute()
    )
    return {"status": "success", "resolved_count": len(result.data)}
