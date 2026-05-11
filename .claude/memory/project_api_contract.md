---
name: MediSync API Contract
description: Full API surface for local FastAPI and cloud FastAPI — endpoints, request/response shapes
type: project
---

## Local FastAPI (localhost:8000)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/patients` | Register new patient — creates Supabase row, opens session, sets active_patient_id |
| POST | `/api/session/login` | Existing patient — validates IC + NURSE_PASSWORD, opens session, sets active_patient_id |
| POST | `/api/session/logout` | Clears active_patient_id, closes session (sets ended_at) |
| GET | `/api/session/active` | Returns current `{ patient_id, name }` or `{ patient_id: null }` |
| POST | `/api/readings` | Receives ESP32 reading, runs get_status(), writes InfluxDB, queues cloud sync |
| GET | `/api/stream` | SSE — streams latest reading every 1s with status field |

`POST /api/readings` requires header `X-Device-Secret: <DEVICE_SECRET>`.

## Cloud FastAPI (Railway)

All endpoints require `Authorization: Bearer <supabase-jwt>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patients` | List all patients |
| GET | `/api/patients/:id` | Single patient details |
| GET | `/api/patients/:id/stream` | SSE live stream including status field |
| GET | `/api/patients/:id/history` | `?from=&to=` date range query |
| GET | `/api/patients/:id/sessions` | Session log |
| GET | `/api/alerts` | Alert log from Supabase |

## SSE Payload (both backends)
```json
{
  "spo2": 97.5,
  "bpm": 72,
  "temperature": 36.6,
  "status": "normal",
  "prediction": "normal",
  "alert": false,
  "ts": "2025-05-06T10:00:01Z"
}
```
`prediction` is `"normal"` until Phase 9 ML is integrated.
