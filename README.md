# MediSync — Wearable Health Monitor

A real-time IoT patient health monitoring system built for clinical bedside and remote admin use.

An ESP32 with SpO₂, BPM, and temperature sensors transmits readings via WiFi using the MQTT protocol to a local Mosquitto broker on the bedside machine. Readings are written locally for low-latency bedside display, and synced asynchronously to the cloud for remote admin monitoring.

---

## Two Display Modes

| | Bedside (Local) | Admin (Cloud) |
|---|---|---|
| Connection | WiFi + MQTT to bedside machine | Internet, anywhere |
| Latency | ~20ms | 1–3s |
| Auth | Shared nurse password | Supabase Auth (email + password) |
| Frontend | Next.js on localhost | Next.js on Vercel |
| Reads from | Local InfluxDB | InfluxDB Cloud |
| Backend | Local FastAPI (localhost) | FastAPI on Railway |

---

## Stack

| Layer | Tech | Where |
|---|---|---|
| Firmware | ESP32, Arduino framework | Device |
| MQTT broker | Mosquitto (Docker) | Bedside machine (port 1883) |
| MQTT bridge | Python (`mqtt_bridge.py`) | Bedside machine |
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
│   ├── main/               # Main sketch — USB serial JSON output (WiFi/MQTT firmware pending)
│   ├── i2c_scan/           # Utility sketch — verify sensor wiring
│   ├── serial_bridge.py    # Current transport — USB Serial → FastAPI; disconnect detection
│   └── mqtt_bridge.py      # Phase 8 WiFi transport — LWT subscription + readings forward
├── backend/
│   ├── local/              # FastAPI — bedside machine (localhost:8000)
│   │   ├── main.py         # App entry point, state, startup + heartbeat watchdog
│   │   ├── status.py       # Rule-based get_status()
│   │   ├── database.py     # Local InfluxDB write client
│   │   ├── supabase_client.py  # Patient + session ops; ghost-session prevention + duration tracking
│   │   ├── sync.py         # Async queue + cloud sync worker (SQLite-backed)
│   │   ├── ml/
│   │   │   ├── predict.py  # load_model() + run_inference() — XGBoost anomaly detection
│   │   │   └── __init__.py
│   │   ├── routers/
│   │   │   ├── patients.py # POST /api/patients
│   │   │   ├── session.py  # login / logout / active
│   │   │   ├── readings.py # POST /api/readings (runs ML inference, stamps last_reading_at)
│   │   │   ├── stream.py   # GET /api/stream (SSE)
│   │   │   └── device.py   # POST /api/device/disconnect (called by bridge on hardware loss)
│   │   └── requirements.txt
│   └── cloud/              # FastAPI — Railway
│       ├── main.py         # App entry point, CORS
│       ├── status.py       # Same rule-based get_status()
│       ├── database.py     # InfluxDB Cloud read client + Supabase client
│       ├── auth.py         # Supabase Auth JWT middleware (require_auth)
│       ├── claude_service.py  # Claude API — stream_generate_summary, analyze_alert_event, stream_chat_followup
│       ├── routers/
│       │   ├── patients.py # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py   # GET /api/patients/:id/stream (SSE)
│       │   ├── history.py  # GET /api/patients/:id/history
│       │   ├── sessions.py # GET /api/patients/:id/sessions
│       │   ├── alerts.py   # GET /api/alerts
│       │   ├── summary.py  # GET /api/patients/:id/summary (streaming SSE)
│       │   └── copilot.py  # POST /api/copilot/analyze + /api/copilot/chat (SSE)
│       └── requirements.txt
├── frontend/
│   ├── bedside/            # Next.js — localhost:3001
│   └── admin/              # Next.js — Vercel
│       └── components/
│           ├── AISummaryPanel/    # Streaming AI Health Summary
│           └── ClinicalCopilot/   # Alert analysis chatbox — streaming multi-turn CDSS drawer
├── ml/                     # Anomaly detection training pipeline
│   ├── health_risk_ml.ipynb           # 18-section training notebook
│   ├── health_risk_model.joblib       # Trained XGBoost model (gitignored)
│   ├── health_risk_scaler.joblib      # StandardScaler (gitignored)
│   ├── health_risk_label_encoder.joblib  # LabelEncoder (gitignored)
│   └── model_metadata.json            # Audit trail + performance numbers
├── supabase/
│   └── migrations/
│       ├── 20260511000000_initial_schema.sql    # patients, sessions, alerts
│       └── 20260528000000_sessions_duration.sql # duration_seconds + closed_reason columns
├── docker-compose.yml      # Local InfluxDB + Mosquitto
└── README.md
```

---

## Patient Flow (Bedside)

1. Nurse opens `localhost:3001`
2. Registers new patient or logs in existing patient via IC number + shared nurse password
3. Session opens in Supabase, `active_patient_id` set in FastAPI memory
4. Dashboard shows live StatusCard, gauge cards (SpO₂, BPM, Temp), and scrolling chart
5. Nurse logs out — session closes with `closed_reason = "manual_logout"` and `duration_seconds` recorded

**Automated session termination:** If the ESP32 loses power or disconnects, the bridge detects it and calls `POST /api/device/disconnect`, closing the session immediately with `closed_reason = "device_disconnect"`. A 5-minute heartbeat watchdog in FastAPI catches cases where the bridge itself crashes.

## Admin Flow (Cloud)

1. Admin logs in via Supabase Auth at the Vercel URL
2. Dashboard shows summary cards and full patient table
3. Click **View** on any patient to see live SSE stream, history chart, session log, and alert log
4. Select a time range (1h / 6h / 24h / 7d) and click **Generate Summary** for a streaming AI clinical narrative
5. Click **Check** on any alert row — the chart zooms to the alert window (Stage 1). Click the red zone in the chart to open the **Clinical AI Copilot** drawer for a per-alert analysis (Stage 2)
6. Click the **"X unresolved"** badge in the Alert Log header to bulk-resolve all open alerts in a single operation (audit trail preserved — rows are soft-resolved, never deleted)

---

## AI Health Summary

The admin patient detail page includes an on-demand **AI Health Summary** powered by the Claude API (`claude-haiku-4-5`). Clinicians select a time range, click **Generate Summary**, and receive a structured clinical narrative that streams in token-by-token covering:

- **Overall patient status** during the period
- **SpO₂ findings** and clinical implications
- **Heart rate findings** and clinical significance
- **Temperature findings** and any concern
- **Recommended Attention Points** — 2–4 actionable items

Pre-computed per-metric stats (min/max/avg, warning/danger reading counts) are sent to the model rather than raw data. The period badge and reading count appear immediately from the SSE `meta` event before the first Claude token arrives.

API endpoint: `GET /api/patients/:id/summary?range=1h|6h|24h|7d` — SSE stream, auth required. Returns 422 if fewer than 2 readings in the window.

---

## Clinical AI Copilot

Each alert row in the admin patient detail page has a **Check** button. The interaction is a deliberate two-stage flow to avoid cognitive overload when chart context and the AI drawer open simultaneously.

**Stage 1 — Chart focus (on "Check" click):**
- The history chart scrolls into view and zooms to the alert window.
- A red **"⚠ Abnormal Detection"** markArea band overlays the chart at the exact alert timestamps.
- The copilot drawer does **not** open yet. History data and the readings slice are pre-fetched in the background.
- The chart badge reads **"Alert zone · Click to analyze"** — hovering the red zone shows a pointer cursor.

**Stage 2 — Copilot open (on markArea click):**
- Clicking the red zone opens the **Clinical AI Copilot** sliding drawer and triggers AI analysis.

**Initial analysis** (buffered JSON): A structured three-section clinical report:
- 📥 **What Happened** — exact metric, value, timestamp, and reading pattern
- 🔍 **Root Cause Hypothesis** — physiological anomaly vs sensor artifact, cross-metric correlations
- ⚡ **Recommended Next Steps** — specific numeric thresholds and monitoring instructions

**Follow-up chat** (streaming SSE): Clinicians can ask open-ended questions about the alert. Responses stream token-by-token with full conversation history. The system prompt is cached so repeated turns within a session cost minimal input tokens.

**Bulk alert resolution:** The "X unresolved" badge in the Alert Log header is a clickable button. Clicking it calls `PUT /api/alerts/resolve-all/{patient_id}`, which stamps `resolved_at = now()` on every open alert for the patient in a single query. No rows are deleted — the full alert history is preserved as a medical audit trail. The frontend optimistically clears the unresolved count immediately without requiring a page refresh.

API endpoints:
- `POST /api/copilot/analyze` — buffered JSON (validation required for structured rendering)
- `POST /api/copilot/chat` — SSE stream with `X-Accel-Buffering: no` for Railway nginx
- `PUT /api/alerts/resolve-all/{patient_id}` — bulk soft-resolve; returns `{ status, resolved_count }`

---

## ML Anomaly Detection

The local backend runs an XGBoost classifier on every reading to detect subtle physiological patterns that fall within technically normal thresholds — the kind rule-based alerts miss.

| | Rule-based (StatusCard) | ML (AlertBadge / MLBadge) | AI Summary | Clinical Copilot |
|---|---|---|---|---|
| Signal | Known dangerous thresholds | Learned patterns from 200k+ readings | Macro trends over time | Per-alert root cause |
| Example | SpO₂ = 88% → DANGER | SpO₂ fluctuating fast at 95% | HR + temp elevated for 6h | 8-min temp ramp = physiological event |
| Frontend | StatusCard | AlertBadge (bedside) · MLBadge (admin) | AISummaryPanel | ClinicalCopilot drawer |
| Trigger | Every reading | Every reading | Clinician clicks Generate | Clinician clicks Check |

**Model:** XGBoost, trained on `human_vital_signs_dataset_2024.csv` (200,020 rows), validated externally on a separate hospital dataset (domain-shift test).

**Features:** `BPM`, `Temperature`, `SpO₂`, `temp_deviation` (`|temp − 37.0|`), `hr_spo2_ratio` (`BPM ÷ SpO₂`)

**Clinical threshold:** 0.5380 (Youden's J, out-of-fold tuned — no test-set leakage)

**Key metrics:** CV AUC 0.7144 ± 0.0025 (50-round repeated stratified K-fold) · External AUC 0.6975

Artefacts live in `ML/` and are loaded once at FastAPI startup into `app.state.ml_model`. If the `.joblib` files are missing, the server starts normally and predictions default to `"normal"`.

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

## ML Anomaly Detection — Model Detail

An XGBoost classifier (Phase 9) runs alongside the rule-based engine on every reading. It detects subtle stress patterns that fall within normal thresholds — e.g. SpO₂ fluctuating abnormally fast at 95%.

- **Model:** XGBoost, trained on `human_vital_signs_dataset_2024.csv` (200 k rows)
- **Features:** BPM, Temperature, SpO₂, `temp_deviation`, `hr_spo2_ratio` (static per reading — no rolling window)
- **Threshold:** 0.5380 (Youden's J, OOF-tuned — no test leakage)
- **Artefacts:** `ml/health_risk_model.joblib`, `ml/health_risk_scaler.joblib`, `ml/health_risk_label_encoder.joblib`
- **Graceful degradation:** if artefacts are missing, `prediction` defaults to `"normal"` and `confidence` to `0.0`

### OOD Safety Override

The model was trained on in-range vitals and cannot reliably classify extreme out-of-distribution values (e.g. temperature 30°C / severe hypothermia, SpO₂ < 90%). To prevent the ML badge showing **NORMAL** alongside a rule-based **DANGER** — which is clinically misleading — `readings.py` applies this guard after inference:

```python
if health_status == "danger" and prediction == "normal":
    prediction = "anomaly"
    confidence = round(1.0 - confidence, 4)  # flip to P(anomaly)
```

The rule-based engine owns extreme thresholds; the ML layer owns subtle within-normal patterns. They are additive, never contradictory.

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
# 1. Start local InfluxDB + Mosquitto MQTT broker
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

### ESP32 — USB Serial (current)

The ESP32 currently outputs JSON over USB serial. The bridge reads it and forwards to FastAPI:

```bash
cd firmware
pip install pyserial requests
python serial_bridge.py   # auto-detects ESP32 COM port, POSTs to localhost:8000
```

The bridge detects disconnection via `SerialException` (USB pulled) and a 30-second idle timeout — both immediately call `POST /api/device/disconnect` to close the active session.

To verify sensor wiring, flash `firmware/i2c_scan/i2c_scan.ino` and open the Serial Monitor — it should report MAX30102 at `0x57` and MLX90614 at `0x5A`.

### ESP32 — WiFi MQTT (Phase 8, pending firmware flash)

**1. Configure WiFi and MQTT credentials** in `firmware/main/config.h`:

```cpp
#define WIFI_SSID     "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"
#define MQTT_BROKER   "192.168.x.x"   // bedside machine IP on the same WiFi network
#define MQTT_PORT     1883
#define MQTT_TOPIC    "medisync/readings"
```

**2. Flash** `firmware/main/main.ino` to the ESP32 (WiFi + MQTT + LWT code not yet added — see Phase 8 checklist in CLAUDE.md).

**3. Start the MQTT bridge** (after `docker compose up -d` has started Mosquitto):

```bash
cd firmware
pip install paho-mqtt requests
python mqtt_bridge.py   # subscribes to medisync/readings + medisync/status (LWT)
```

The bridge subscribes to the LWT topic `medisync/status` — when the ESP32 loses power the broker broadcasts `{"status":"offline"}` and the bridge immediately closes the session.

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
| 8 | ESP32 firmware — WiFi + MQTT | ⏳ Bridge done; firmware WiFi flash pending |
| 8.5 | Claude API CDSS — AI Summary + Clinical Copilot | ✅ Done |
| 9 | ML anomaly detection | ✅ Done |
| 10 | Polish & hardening | ✅ Done |
| 11 | Session lifecycle management — automated termination | ✅ Done |

---

## Notes

- ML artefacts (`ml/*.joblib`) are gitignored — retrain locally after cloning by re-running `ml/health_risk_ml.ipynb`
- `app.state.active_patient_id` is in-memory — restarting local FastAPI requires the nurse to log in again
- `status.py` is duplicated in local and cloud backends — keep them in sync
- ESP32 currently sends readings via USB serial; `serial_bridge.py` forwards to FastAPI. WiFi MQTT firmware not yet flashed.
- Session `closed_reason` values: `"manual_logout"` (nurse clicked logout) | `"device_disconnect"` (bridge detected hardware loss) | `"auto_timeout"` (5-min watchdog fallback)
- The Phase 11 Supabase migration (`20260528000000_sessions_duration.sql`) must be run in the SQL editor before deploying the updated backend
- InfluxDB Cloud free tier: 5 MB/5 min write limit, 30-day retention
- `ANTHROPIC_API_KEY` must be set in Railway for AI summary and Clinical Copilot — not needed locally
