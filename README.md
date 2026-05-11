# MediSync — Wearable Health Monitor

A real-time IoT patient health monitoring system built for clinical bedside and remote admin use.

An ESP32 with SpO₂, BPM, and temperature sensors connects to a bedside machine via USB. Readings are written locally for near-zero latency bedside display, and synced asynchronously to the cloud for remote admin monitoring.

---

## Two Display Modes

| | Bedside (Local) | Admin (Cloud) |
|---|---|---|
| Connection | USB to bedside laptop | Internet, anywhere |
| Latency | ~1ms | 1–3s |
| Auth | Shared nurse password | Supabase Auth (email + password) |
| Frontend | Next.js on localhost | Next.js on Vercel |
| Reads from | Local InfluxDB | InfluxDB Cloud |
| Backend | Local FastAPI (localhost) | FastAPI on Railway |

---

## Stack

| Layer | Tech | Where |
|---|---|---|
| Firmware | ESP32, Arduino framework | Device |
| Local backend | FastAPI | Bedside machine (localhost:8000) |
| Cloud backend | FastAPI | Railway |
| Time-series (local) | InfluxDB via Docker | Bedside machine (localhost:8087) |
| Time-series (cloud) | InfluxDB Cloud (Singapore) | Cloud |
| Relational DB | Supabase Postgres | Cloud |
| Auth | Supabase Auth (admin) + shared nurse password (bedside) | Cloud |
| Bedside frontend | Next.js | localhost:3000 |
| Admin frontend | Next.js | Vercel |

---

## Monorepo Structure

```
MediSync/
├── firmware/               # ESP32 Arduino firmware
├── backend/
│   ├── local/              # FastAPI — bedside machine (localhost:8000)
│   │   ├── main.py         # App entry point, state, startup
│   │   ├── status.py       # Rule-based get_status()
│   │   ├── database.py     # Local InfluxDB write client
│   │   ├── supabase_client.py  # Patient + session ops
│   │   ├── sync.py         # Async queue + cloud sync worker
│   │   ├── routers/
│   │   │   ├── patients.py # POST /api/patients
│   │   │   ├── session.py  # login / logout / active
│   │   │   ├── readings.py # POST /api/readings
│   │   │   └── stream.py   # GET /api/stream (SSE)
│   │   └── requirements.txt
│   └── cloud/              # FastAPI — Railway
├── frontend/
│   ├── bedside/            # Next.js — localhost
│   └── admin/              # Next.js — Vercel
├── ml/                     # Anomaly detection notebooks + data
├── supabase/
│   └── migrations/         # SQL migration files (run in Supabase SQL editor)
├── docker-compose.yml      # Local InfluxDB
└── README.md
```

---

## Patient Flow (Bedside)

1. Nurse opens `localhost:3000`
2. Registers new patient or logs in existing patient via IC number + shared nurse password
3. Session opens in Supabase, `active_patient_id` set in FastAPI memory
4. Dashboard shows live StatusCard, gauge cards (SpO₂, BPM, Temp), and scrolling chart
5. Nurse logs out — session closes, active patient cleared

## Admin Flow (Cloud)

1. Admin logs in via Supabase Auth at the Vercel URL
2. Dashboard shows summary cards and full patient table
3. Click **View** on any patient to see live SSE stream, history chart, session log, and alert log

---

## Status Logic

Rule-based, computed on every reading:

| Status | SpO₂ | BPM | Temperature |
|---|---|---|---|
| Normal | 95–100% | 60–100 | 36.1–37.2°C |
| Warning | 90–94% | 40–60 or 100–130 | 37.3–38.0°C |
| Danger | < 90% | < 40 or > 130 | > 38°C or < 35°C |

Danger state pulses red on the StatusCard. A separate ML anomaly detection layer (Phase 9) catches subtle pattern deviations within normal ranges.

---

## SSE Stream Payload

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

---

## Local Development

### Prerequisites
- Docker Desktop
- Python 3.11+
- Node.js 20+

### Bedside Setup

```bash
# 1. Start local InfluxDB
docker compose up -d

# 2. Start local backend
cd backend/local
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# 3. Start bedside frontend
cd frontend/bedside
npm install
npm run dev
```

Open `http://localhost:3000`.

> **Note:** Local InfluxDB runs on port **8087** (not 8086). UI at `http://localhost:8087`, token: `medisync-local-token`.

### Environment Variables

Copy the relevant `.env.example` files and fill in your credentials:

- `backend/local/.env`
- `backend/cloud/.env`
- `frontend/bedside/.env.local`
- `frontend/admin/.env.local`
- `firmware/config.h`

See `CLAUDE.md` for the full variable reference.

---

## Deployment

| Service | Platform | Config |
|---|---|---|
| Cloud backend | Railway | Root: `/backend/cloud`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Admin frontend | Vercel | Root: `/frontend/admin`, framework: Next.js |
| Local InfluxDB | Docker | `docker compose up -d` |

---

## Implementation Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Local InfluxDB setup | ✅ Done |
| 2 | InfluxDB Cloud setup | ✅ Done |
| 3 | Supabase schema + auth | ✅ Done |
| 4 | Local FastAPI backend | ✅ Done |
| 5 | Cloud FastAPI backend | Pending |
| 6 | Bedside frontend | Pending |
| 7 | Admin frontend | Pending |
| 8 | ESP32 firmware | Pending |
| 9 | ML anomaly detection | Pending |
| 10 | Polish & hardening | Pending |

---

## Notes

- `model.pkl` is gitignored — retrain locally after cloning
- `app.state.active_patient_id` is in-memory — restarting local FastAPI requires the nurse to log in again
- `status.py` is duplicated in local and cloud backends — keep them in sync
- ESP32 connects over WiFi (same LAN as bedside machine), not USB serial for HTTP
- InfluxDB Cloud free tier: 5 MB/5 min write limit, 30-day retention
