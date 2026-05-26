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
| AI summarization | Claude API (`claude-haiku-4-5`) | Cloud (on-demand) |
| Bedside frontend | Next.js | localhost:3001 |
| Admin frontend | Next.js | Vercel |

---

## Monorepo Structure

```
MediSync/
├── firmware/
│   ├── main/               # Main sketch — Serial JSON + LED status
│   ├── i2c_scan/           # Utility sketch — verify sensor wiring
│   └── serial_bridge.py    # Reads USB Serial, POSTs to local FastAPI
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
│       ├── claude_service.py  # Claude API client + generate_summary()
│       ├── Procfile        # Railway start command
│       ├── routers/
│       │   ├── patients.py # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py   # GET /api/patients/:id/stream (SSE)
│       │   ├── history.py  # GET /api/patients/:id/history
│       │   ├── sessions.py # GET /api/patients/:id/sessions
│       │   ├── alerts.py   # GET /api/alerts
│       │   └── summary.py  # GET /api/patients/:id/summary (AI Health Summary)
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
4. Select a time range (1h / 6h / 24h / 7d) and click **Generate Summary** for an AI clinical narrative

---

## AI Health Summary

The admin patient detail page includes an on-demand **AI Health Summary** powered by the Claude API (`claude-haiku-4-5`). Clinicians select a time range, click **Generate Summary**, and receive a structured clinical narrative covering:

- **Overall patient status** during the period
- **SpO₂ findings** and clinical implications
- **Heart rate findings** and clinical significance
- **Temperature findings** and any concern
- **Recommended Attention Points** — 2–4 actionable items

Pre-computed per-metric stats (min/max/avg, warning/danger reading counts) are sent to the model rather than raw data. The summary includes a disclaimer that it is AI-generated and not a substitute for clinical judgment.

API endpoint: `GET /api/patients/:id/summary?range=1h|6h|24h|7d` (auth required, returns 422 if fewer than 2 readings in the window).

---

## Status Logic

Rule-based, computed on every reading:

| Status | SpO₂ | BPM | Temperature |
|---|---|---|---|
| Normal | 95–100% | 60–100 | 36.1–37.2°C |
| Warning | 90–94% | 40–60 or 100–130 | 37.3–38.0°C |
| Danger | < 90% | < 40 or > 130 | > 38°C or < 35°C |

Danger state pulses red on the StatusCard. A separate ML anomaly detection layer (Phase 9) catches subtle pattern deviations within technically normal ranges — shown as an `AlertBadge` on the bedside dashboard and `MLBadge` on the admin patient detail page.

---

## ML Anomaly Detection

An XGBoost classifier (Phase 9) runs alongside the rule-based engine on every reading. It detects subtle stress patterns that fall within normal thresholds — e.g. SpO₂ fluctuating abnormally fast at 95%.

- **Model:** XGBoost, trained on `human_vital_signs_dataset_2024.csv` (200 k rows)
- **Features:** BPM, Temperature, SpO₂, `temp_deviation`, `hr_spo2_ratio`
- **Threshold:** 0.5380 (Youden's J, OOF-tuned — no test leakage)
- **Artefacts:** `ML/health_risk_model.joblib`, `ML/health_risk_scaler.joblib`, `ML/health_risk_label_encoder.joblib`
- **Graceful degradation:** if artefacts are missing, `prediction` defaults to `"normal"` and `confidence` to `0.0`

When `alert = true` (danger status **or** ML anomaly), a row is written to the Supabase `alerts` table in real time so the admin dashboard alert log stays current.

---

## SSE Stream Payload

```json
{
  "spo2": 97.5,
  "bpm": 72,
  "temperature": 36.6,
  "status": "normal",
  "prediction": "normal",
  "confidence": 0.6096,
  "alert": false,
  "ts": "2025-05-06T10:00:01Z"
}
```

`prediction` — ML result: `"normal"` or `"anomaly"`.  
`confidence` — probability of the predicted class (0–1). `0.0` when model is not loaded or SpO₂ is unavailable.

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

### ESP32 Serial Bridge

After flashing `firmware/main/main.ino` to the ESP32:

```bash
cd firmware
pip install pyserial requests
python serial_bridge.py   # auto-detects ESP32 USB port
```

The bridge reads JSON lines from the ESP32 over USB Serial and forwards each reading to `localhost:8000/api/readings`. The local backend must be running first.

To verify sensor wiring before flashing the main sketch, flash `firmware/i2c_scan/i2c_scan.ino` and open the Serial Monitor — it should report MAX30102 at `0x57` and MLX90614 at `0x5A`.

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

The AI Health Summary is served by the cloud backend. Set `ANTHROPIC_API_KEY` in the Railway dashboard (not in the frontend env).

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
| 8 | ESP32 firmware | ✅ Done |
| 8.5 | Claude API AI Health Summary | ✅ Done |
| 9 | ML anomaly detection | ✅ Done |
| 10 | Polish & hardening | ✅ Done |

---

## Notes

- ML artefacts (`ML/*.joblib`) are gitignored — retrain locally after cloning using `ML/health_risk_ml.ipynb`
- `app.state.active_patient_id` is in-memory — restarting local FastAPI requires the nurse to log in again
- `status.py` is duplicated in local and cloud backends — keep them in sync
- ESP32 sends readings over USB Serial to `serial_bridge.py`, not directly via WiFi/HTTP
- InfluxDB Cloud free tier: 5 MB/5 min write limit, 30-day retention
- `ANTHROPIC_API_KEY` must be set in Railway for the AI summary endpoint — it is not needed locally
