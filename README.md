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
| Bedside frontend | Next.js | localhost:3001 |
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
│   └── cloud/              # FastAPI — Railway (localhost:8001 for dev)
│       ├── main.py         # App entry point, CORS
│       ├── status.py       # Same rule-based get_status()
│       ├── database.py     # InfluxDB Cloud read client + Supabase client
│       ├── auth.py         # Supabase Auth JWT middleware (require_auth)
│       ├── Procfile        # Railway start command
│       ├── routers/
│       │   ├── patients.py # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py   # GET /api/patients/:id/stream (SSE)
│       │   ├── history.py  # GET /api/patients/:id/history
│       │   ├── sessions.py # GET /api/patients/:id/sessions
│       │   └── alerts.py   # GET /api/alerts
│       └── requirements.txt
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

**One-command start (recommended):**

```bash
./start-bedside.sh
```

Opens `http://localhost:3001` automatically. Kills stale processes on 8000/3001, starts backend, waits for readiness, then starts frontend. `Ctrl+C` stops both.

**Manual start:**

```bash
# 1. Start local InfluxDB
docker compose up -d

# 2. Start local backend
cd backend/local
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000

# 3. Start bedside frontend
cd frontend/bedside
npm run dev
```

Open `http://localhost:3001` (port 3000 may be occupied on some machines).

### Admin Frontend (local dev)

```bash
cd frontend/admin
npm run dev
```

Open `http://localhost:3002`. Log in with your Supabase admin email and password.

Requires `frontend/admin/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://medisync-cloud-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://rzzxrlfgmkdoarglcpdw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Cloud Backend (local dev)

```bash
cd backend/cloud
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

Swagger UI at `http://localhost:8001/docs`.

To get a JWT for testing:

```bash
curl -X POST 'https://<your-project>.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@email.com", "password": "yourpassword"}'
```

Use the returned `access_token` as `Authorization: Bearer <token>` on all cloud API requests.
SSE endpoints accept the token as a `?token=` query parameter instead (browsers cannot set headers on `EventSource`).

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

| Service | Platform | URL / Config |
|---|---|---|
| Cloud backend | Railway | `https://medisync-cloud-api-production.up.railway.app` — root: `/backend/cloud`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Admin frontend | Vercel | `https://medi-sync-eta.vercel.app` — root: `/frontend/admin`, framework: Next.js (declared via `vercel.json`) |
| Local InfluxDB | Docker | `docker compose up -d` |

---

## Implementation Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Local InfluxDB setup | ✅ Done |
| 2 | InfluxDB Cloud setup | ✅ Done |
| 3 | Supabase schema + auth | ✅ Done |
| 4 | Local FastAPI backend | ✅ Done |
| 5 | Cloud FastAPI backend | ✅ Done |
| 6 | Bedside frontend | ✅ Done |
| 7 | Admin frontend | ✅ Done |
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
