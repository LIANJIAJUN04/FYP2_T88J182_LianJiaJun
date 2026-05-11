from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from supabase_client import create_patient, open_session

router = APIRouter()


class PatientIn(BaseModel):
    name: str
    ic_number: str
    ward: str
    age: int
    gender: str
    assigned_doctor: str


@router.post("/api/patients")
async def register_patient(body: PatientIn, request: Request):
    try:
        patient = create_patient(
            name=body.name,
            ic_number=body.ic_number,
            ward=body.ward,
            age=body.age,
            gender=body.gender,
            assigned_doctor=body.assigned_doctor,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    patient_id = patient["id"]
    open_session(patient_id)

    request.app.state.active_patient_id = patient_id
    request.app.state.active_patient_name = patient["name"]

    return {"patient_id": patient_id, "status": "registered"}
