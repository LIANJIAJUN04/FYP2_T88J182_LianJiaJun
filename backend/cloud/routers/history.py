import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_auth
from database import get_history

router = APIRouter()


def _to_rfc3339(date_str: str, end_of_day: bool = False) -> str:
    """Convert YYYY-MM-DD to RFC3339 UTC string."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str}. Use YYYY-MM-DD.")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("/api/patients/{patient_id}/history")
async def get_patient_history(
    patient_id: str,
    from_date: str = Query(alias="from"),
    to_date: str = Query(alias="to"),
    auth: dict = Depends(require_auth),
):
    start = _to_rfc3339(from_date)
    stop = _to_rfc3339(to_date, end_of_day=True)
    readings = await asyncio.to_thread(get_history, patient_id, start, stop)
    return readings
