# CLAUDE.md — Wearable Health Monitor

## Rules for Claude Code

- **Never run `git push` or any GitHub/remote operations.** The user handles all pushes and PRs themselves. Only commit locally — never push.

---

## Project Overview

A real-time IoT patient health monitoring system. An ESP32 with SpO₂, BPM, and temperature sensors transmits readings via WiFi using the MQTT protocol to a local Mosquitto broker on the bedside machine. Readings are written locally for low-latency bedside display, and synced asynchronously to the cloud for remote admin monitoring. Each patient has their own session and isolated reading history in InfluxDB via `patient_id` tagging.

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

## Full Stack

| Layer | Tech | Where |
|---|---|---|
| Firmware | ESP32, Arduino framework | Device |
| MQTT broker | Mosquitto (Docker) | Bedside machine (port 1883) |
| MQTT bridge | Python (`mqtt_bridge.py`) | Bedside machine |
| Local backend | FastAPI | Bedside machine (localhost:8000) |
| Cloud backend | FastAPI | Railway |
| Time-series (local) | InfluxDB via Docker | Bedside machine (localhost:8087) |
| Time-series (cloud) | InfluxDB Cloud (Singapore region) | Cloud |
| Relational DB | Supabase Postgres | Cloud |
| Auth | Supabase Auth (admin) + shared nurse password (bedside) | Cloud |
| AI summarization | Claude API (`claude-haiku-4-5`) | Cloud (on-demand) |
| Bedside frontend | Next.js | localhost:3001 |
| Admin frontend | Next.js | Vercel |

---

## User Flow

### Index Page (`/`)
Two buttons — **Patient** or **Admin**. This is the root of both apps but behaves differently:
- Bedside app (`localhost:3001`) — shows Patient button only
- Admin app (Vercel) — shows Admin button only

---

### Patient Flow (Bedside — localhost)

```
/
└──► "New Patient" or "Existing Patient"

New Patient
  └──► Nurse fills registration form
            └──► POST to local FastAPI
                      └──► Creates patient in Supabase
                           Opens new session in Supabase
                           Sets active_patient_id in FastAPI memory
                           └──► Redirect to /dashboard
                                     (StatusCard + GaugeCards + LiveChart)

Existing Patient
  └──► Enter IC Number + shared nurse password
            └──► Validates IC against Supabase
                 Validates password against NURSE_PASSWORD env var
                 Opens new session row in Supabase
                 Sets active_patient_id in FastAPI memory
                 └──► Redirect to /dashboard

Patient Logout
  └──► Clears active_patient_id in FastAPI memory
       Closes session (sets ended_at in Supabase)
       └──► Redirect to /
```

### Middleware (Bedside)
```ts
// proxy.ts (Next.js 16 convention — replaces middleware.ts)
if (pathname === '/dashboard' && !activePatient) {
  redirect('/')
}
```
No way to reach `/dashboard` without an active patient. Direct URL access redirects to `/`.

---

### Admin Flow (Vercel)

```
/
└──► Email + password login (Supabase Auth)
          └──► /dashboard
                ├── Summary cards
                │     (total patients, active sessions,
                │      unresolved alerts, critical patients)
                │
                └── Patients table
                      columns: Name, IC Number, Ward, Age,
                               Gender, Doctor, Last Reading,
                               Status (active/inactive), Alerts
                      └──► "View" button per row
                                └──► /patient/[id]
                                          StatusCard (live)
                                          live SSE chart (cloud)
                                          SpO₂, BPM, Temp gauges
                                          history chart + date picker
                                          AI Health Summary (streaming)
                                          session log
                                          alert log + "Check" button per alert
                                            └──► Stage 1: HistoryChart zooms to alert window
                                                   red markArea rendered; drawer stays hidden
                                                   history + readings slice fetched in background
                                                   badge reads "Alert zone · Click to analyze"
                                                   └──► User clicks red markArea in chart
                                                          └──► Stage 2: ClinicalCopilot drawer opens
                                                                 initial analysis (buffered)
                                                                 multi-turn follow-up (streaming)
```

---

## Monorepo Structure

```
MediSync/
├── firmware/
│   ├── main/
│   │   ├── main.ino                 # Main loop — USB serial JSON output (WiFi/MQTT pending)
│   │   ├── config.h                 # Pins, WiFi credentials, MQTT broker IP + topic
│   │   └── sensors.h                # sensorsBegin/Update, readSpO2/BPM/Temperature
│   ├── i2c_scan/
│   │   ├── i2c_scan.ino             # Utility — scan I2C bus, verify 0x57/0x5A
│   │   └── config.h                 # SDA/SCL pins
│   ├── serial_bridge.py             # Current transport — USB Serial → FastAPI; SerialException + idle disconnect detection
│   └── mqtt_bridge.py               # Phase 8 WiFi transport — LWT subscriber + readings forwarder
│
├── backend/
│   ├── local/                       # Runs on bedside machine
│   │   ├── main.py                  # FastAPI app, holds active_patient_id state
│   │   ├── database.py              # Local InfluxDB client
│   │   ├── supabase_client.py       # Supabase client (patient + session ops)
│   │   ├── sync.py                  # Async queue + cloud sync worker
│   │   ├── status.py                # Rule-based status logic
│   │   ├── routers/
│   │   │   ├── readings.py          # POST /api/readings (stamps last_reading_at)
│   │   │   ├── stream.py            # GET /api/stream (SSE)
│   │   │   ├── patients.py          # POST /api/patients (register)
│   │   │   ├── session.py           # POST /api/session/login, /logout, GET /active
│   │   │   └── device.py            # POST /api/device/disconnect (bridge calls on disconnect)
│   │   ├── ml/
│   │   │   ├── model.pkl            # Trained model (gitignored)
│   │   │   └── predict.py
│   │   └── requirements.txt
│   │
│   └── cloud/                       # Runs on Railway
│       ├── main.py
│       ├── database.py              # InfluxDB Cloud + Supabase clients
│       ├── auth.py                  # Supabase Auth JWT middleware
│       ├── status.py                # Same rule-based status logic
│       ├── claude_service.py        # Claude API — stream_generate_summary(), analyze_alert_event(), stream_chat_followup()
│       ├── railway.json             # Railway deploy config
│       ├── routers/
│       │   ├── patients.py          # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py            # GET /api/patients/:id/stream (SSE)
│       │   ├── history.py           # GET /api/patients/:id/history
│       │   ├── sessions.py          # GET /api/patients/:id/sessions
│       │   ├── alerts.py            # GET /api/alerts + PUT /api/alerts/resolve-all/{patient_id}
│       │   ├── summary.py           # GET /api/patients/:id/summary (SSE streaming)
│       │   └── copilot.py           # POST /api/copilot/analyze (JSON) + /api/copilot/chat (SSE)
│       └── requirements.txt
│
├── frontend/
│   ├── bedside/                     # Next.js — localhost:3001
│   │   ├── app/
│   │   │   ├── page.tsx             # Index — New Patient / Existing Patient
│   │   │   ├── register/page.tsx    # New patient registration form
│   │   │   ├── login/page.tsx       # Existing patient — IC + nurse password
│   │   │   └── dashboard/page.tsx   # StatusCard + GaugeCards + LiveChart
│   │   ├── components/
│   │   │   ├── StatusCard/
│   │   │   │   ├── StatusCard.tsx
│   │   │   │   ├── StatusCard.hooks.ts
│   │   │   │   └── StatusCard.types.ts
│   │   │   ├── GaugeCard/
│   │   │   │   ├── GaugeCard.tsx
│   │   │   │   ├── GaugeCard.hooks.ts
│   │   │   │   └── GaugeCard.types.ts
│   │   │   └── LiveChart/
│   │   │       ├── LiveChart.tsx
│   │   │       ├── LiveChart.hooks.ts
│   │   │       └── LiveChart.types.ts
│   │   ├── proxy.ts                 # Redirect /dashboard → / if no active patient
│   │   └── lib/
│   │       └── api.ts
│   │
│   └── admin/                       # Next.js — Vercel
│       ├── app/
│       │   ├── page.tsx             # Login page
│       │   ├── dashboard/page.tsx   # Summary cards + patients table
│       │   └── patient/
│       │       └── [id]/page.tsx    # StatusCard + live + history chart
│       ├── components/
│       │   ├── StatusCard/          # Same component, reads from cloud SSE
│       │   ├── SummaryCard/
│       │   ├── PatientTable/
│       │   ├── LiveChart/
│       │   ├── HistoryChart/
│       │   ├── AlertBadge/
│       │   ├── AISummaryPanel/      # Claude API streaming clinical summary
│       │   └── ClinicalCopilot/     # AI alert analysis chatbox — streaming multi-turn CDSS drawer
│       ├── proxy.ts                 # Redirect to / if no sb-token cookie
│       └── lib/
│           └── api.ts
│
├── ml/
│   ├── collect_data.ipynb
│   ├── train_model.ipynb
│   └── data/
│       └── readings.csv
│
├── supabase/
│   └── migrations/
│       ├── 20260511000000_initial_schema.sql   # patients, sessions, alerts
│       └── 20260528000000_sessions_duration.sql # duration_seconds + closed_reason columns
│
├── docker-compose.yml
├── start-bedside.sh                 # One-command bedside startup
└── README.md
```

---

## Component Structure Convention (Next.js)

Separate markup from logic to keep JSX readable.

```
components/StatusCard/
├── StatusCard.tsx          ← JSX markup only
├── StatusCard.hooks.ts     ← reads from SSE stream, derives status
├── StatusCard.utils.ts     ← colour + label helpers
└── StatusCard.types.ts     ← TypeScript interfaces
```

---

## Bedside Dashboard Layout

```
┌─────────────────────────────────────────────┐
│  Patient: Ali bin Abu    Ward: A3    [Logout]│
├─────────────────────────────────────────────┤
│                                             │
│           ┌───────────────────┐             │
│           │      STATUS       │             │
│           │                   │             │
│           │    ●  NORMAL      │  ← green    │
│           │                   │             │
│           └───────────────────┘             │
│                                             │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│   │  SpO₂    │ │   BPM    │ │  Temp    │   │
│   │  97.5%   │ │   72     │ │ 36.6°C   │   │
│   └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│   [ Live Chart — scrolling time-series ]    │
│                                             │
└─────────────────────────────────────────────┘
```

Status card is prominent and front and center. Updates on every SSE event.

---

## Rule-Based Status Logic

Lives in `backend/local/status.py` and `backend/cloud/status.py` (same file, copied).

```python
# status.py

def get_status(spo2: float, bpm: int, temperature: float) -> str:
    if (
        spo2 < 90 or
        bpm < 40 or bpm > 130 or
        temperature > 38 or temperature < 35
    ):
        return "danger"
    elif (
        spo2 < 95 or
        bpm < 60 or bpm > 100 or
        temperature > 37.2
    ):
        return "warning"
    else:
        return "normal"
```

Called on every `POST /api/readings`. Result included in:
- InfluxDB point as `status` field
- SSE stream payload
- Cloud sync queue

### Status vs ML Prediction vs AI Summary vs Clinical Copilot — Four Separate Layers

| | Rule-based Status | ML Anomaly Detection | AI Health Summary | Clinical Copilot |
|---|---|---|---|---|
| Logic | Simple if/else thresholds | XGBoost on vital patterns | Claude API period narrative | Claude API per-alert CDSS |
| Available | Phase 4 | Phase 9 | Phase 8.5 | Phase 8.5 |
| What it catches | Known dangerous values | Subtle within-normal patterns | Macro trends over time | Root cause of a specific alert |
| Example | SpO₂ = 88% → danger | SpO₂ fluctuating fast at 95% | "HR and temp both elevated over 6h" | "Gradual 8-min temp ramp + tachycardia → physiological, not sensor artifact" |
| Displayed as | `StatusCard` (NORMAL / WARNING / DANGER) | `AlertBadge` / `MLBadge` | `AISummaryPanel` — streaming narrative | `ClinicalCopilot` drawer — streaming chat |
| Triggered by | Every reading | Every reading | Clinician clicks Generate | Clinician clicks Check on an alert |

StatusCard is always available from Phase 4. AI Summary and Clinical Copilot are available from Phase 8.5.

---

## SSE Stream Payload

Every SSE event includes status so the frontend never has to recalculate it:

```
data: {
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

`prediction` — ML model result: `"normal"` or `"anomaly"` (Phase 9).  
`confidence` — probability of the predicted class (0–1). `0.0` when model not loaded or SpO₂ unavailable.

### Status Colours (Frontend)

```ts
// StatusCard.utils.ts
export const statusConfig = {
  normal:  { label: "NORMAL",  bg: "bg-green-500",  pulse: false },
  warning: { label: "WARNING", bg: "bg-yellow-400", pulse: false },
  danger:  { label: "DANGER",  bg: "bg-red-600",    pulse: true  },
}
```

Danger state pulses to draw immediate attention.

---

## Environment Variables

### Local Backend (`backend/local/.env`)
```env
LOCAL_INFLUX_URL=http://localhost:8087
LOCAL_INFLUX_TOKEN=medisync-local-token
LOCAL_INFLUX_ORG=health-org
LOCAL_INFLUX_BUCKET=health_local

CLOUD_INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=Jacky
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://rzzxrlfgmkdoarglcpdw.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

NURSE_PASSWORD=shared-nurse-password
DEVICE_SECRET=esp32
```

### Cloud Backend (`backend/cloud/.env` / Railway)
```env
CLOUD_INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=Jacky
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://rzzxrlfgmkdoarglcpdw.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Bedside Frontend (`frontend/bedside/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Admin Frontend (`frontend/admin/.env.local`)
```env
NEXT_PUBLIC_API_URL=https://medisync-cloud-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://rzzxrlfgmkdoarglcpdw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### MQTT Bridge (`firmware/mqtt_bridge.py`)
```python
MQTT_BROKER   = "localhost"          # or bedside machine LAN IP
MQTT_PORT     = 1883
MQTT_TOPIC    = "medisync/readings"
API_URL       = "http://localhost:8000/api/readings"
DEVICE_SECRET = "esp32"
DEVICE_ID     = "esp32-001"
```
No config file needed — edit constants at the top of the script.

### Firmware (`firmware/main/config.h`)
```cpp
// WiFi
#define WIFI_SSID     "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// MQTT
#define MQTT_BROKER   "192.168.x.x"   // bedside machine LAN IP
#define MQTT_PORT     1883
#define MQTT_TOPIC    "medisync/readings"
#define DEVICE_ID     "esp32-001"
#define DEVICE_SECRET "esp32"
```

---

## API Contract

### Local FastAPI (`localhost:8000`)

#### POST `/api/patients`
```json
// Request
{ "name": "Ali bin Abu", "ic_number": "990101-14-1234", "ward": "A3", "age": 35, "gender": "male", "assigned_doctor": "Dr. Lim" }
// Response
{ "patient_id": "uuid", "status": "registered" }
```

#### POST `/api/session/login`
```json
// Request
{ "ic_number": "990101-14-1234", "password": "nurse-shared-password" }
// Response
{ "patient_id": "uuid", "name": "Ali bin Abu", "status": "ok" }
```

#### POST `/api/session/logout`
```json
// Response
{ "status": "logged_out" }
```

#### GET `/api/session/active`
```json
// Response
{ "patient_id": "uuid", "name": "Ali bin Abu" }
// or
{ "patient_id": null }
```

#### POST `/api/readings`
```json
// Request headers: X-Device-Secret: <DEVICE_SECRET>
{ "spo2": 97.5, "bpm": 72, "temperature": 36.6, "timestamp": 1746518400 }
// Response
{ "status": "ok", "health_status": "normal", "prediction": "normal", "confidence": 0.6096, "alert": false }
```

Internally: run `get_status()`, run ML inference, apply OOD safety override (if `health_status == "danger"` and ML says `"normal"`, force `prediction = "anomaly"` and flip confidence), write to local InfluxDB with `status` + `confidence` fields + `patient_id` tag, queue cloud sync, stamp `app.state.last_reading_at` for heartbeat watchdog.

#### POST `/api/device/disconnect`
```json
// Response
{ "status": "session_closed", "patient_id": "uuid-or-null" }
```
Called by `serial_bridge.py` (on SerialException or idle timeout) and `mqtt_bridge.py` (on LWT `offline` message). Closes the active session immediately with `closed_reason = "device_disconnect"` and clears all in-memory state. The `_heartbeat_watchdog` background task provides a 5-minute fallback if the bridge crashes without calling this.

#### GET `/api/stream`
```
data: {"spo2":97.5,"bpm":72,"temperature":36.6,"status":"normal","prediction":"normal","confidence":0.6096,"alert":false,"ts":"..."}
```

---

### Cloud FastAPI (Railway)

#### GET `/api/patients` — list all patients (auth required)
#### GET `/api/patients/:id` — single patient details
#### GET `/api/patients/:id/stream` — SSE live stream (includes status field)
#### GET `/api/patients/:id/history` — `?from=2025-05-01&to=2025-05-06`
#### GET `/api/patients/:id/sessions` — session log
#### GET `/api/alerts` — alert log from Supabase
#### PUT `/api/alerts/resolve-all/{patient_id}` — bulk soft-resolve (auth required)
```json
// Response
{ "status": "success", "resolved_count": 3 }
```
Sets `resolved_at = now()` on every row where `resolved_at IS NULL` for the given patient. No rows are deleted — full audit trail is preserved. Frontend optimistically clears the unresolved count and re-renders the table immediately.

#### GET `/api/patients/:id/summary` — AI clinical summary SSE stream (auth required)
```
// Query params: ?range=1h|6h|24h|7d  (default: 24h)
// SSE event sequence:
data: {"type": "meta", "period": "Last 24 hours", "readings_count": 1440}
data: {"type": "chunk", "text": "During the last 24 hours..."}
data: {"type": "chunk", "text": " the patient maintained..."}
data: {"type": "done"}
// or on error:
data: {"type": "error", "message": "..."}
```
Fetches historical readings from InfluxDB Cloud, pre-computes per-metric stats in Python, streams the Claude narrative token-by-token. Returns 422 if fewer than 2 readings exist for the period. The `meta` event fires before the first Claude token so the UI shows period + reading count immediately.

#### POST `/api/copilot/analyze` — initial alert analysis (auth required)
```json
// Request
{
  "metric": "temperature",
  "value": 38.7,
  "triggered_at": "2026-05-28T10:00:00Z",
  "resolved_at": "2026-05-28T10:15:00Z",
  "readings_slice": [{"ts":"...","spo2":97.1,"bpm":88,"temperature":38.7}]
}
// Response (buffered JSON — not SSE)
{ "analysis": "📥 **What Happened**\n...\n🔍 **Root Cause...", "readings_count": 25 }
```
Returns a validated three-section analysis (📥 / 🔍 / ⚡). Buffered (not SSE) because the `BubbleContent` renderer in `ClinicalCopilot.tsx` requires all three emoji section markers to be present before rendering. If the model omits a section, a structured fallback is returned instead of broken output.

#### POST `/api/copilot/chat` — streaming follow-up conversation (auth required)
```
// Request: same fields as /analyze plus history[] and message
// SSE event sequence:
data: {"type": "chunk", "text": "The temperature spike..."}
data: {"type": "done"}
// or:
data: {"type": "error", "message": "..."}
```
Streams multi-turn follow-up answers to clinical questions about the alert event. Uses two-block prompt caching: static role block (cached, ~120 tokens saved per turn) + dynamic alert context block (not cached).

---

## Supabase Schema

```sql
CREATE TABLE patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  ic_number        TEXT UNIQUE NOT NULL,
  ward             TEXT,
  age              INTEGER,
  gender           TEXT,
  assigned_doctor  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID REFERENCES patients(id),
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,     -- NULL means currently active
  duration_seconds INTEGER,         -- computed on close: int((ended_at - started_at).total_seconds())
  closed_reason    TEXT             -- 'manual_logout' | 'device_disconnect' | 'auto_timeout'
);

CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id),
  metric        TEXT NOT NULL,   -- 'spo2' | 'bpm' | 'temperature'
  value         FLOAT NOT NULL,
  triggered_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Admins managed by Supabase Auth (auth.users)
```

---

## InfluxDB Data Model

### Measurement: `health_readings`

| Field | Type | Description |
|---|---|---|
| `spo2` | float | Blood oxygen % |
| `bpm` | int | Heart rate |
| `temperature` | float | Body temp °C |
| `status` | string | `normal` / `warning` / `danger` — rule-based |
| `prediction` | string | `normal` / `anomaly` — ML model (Phase 9) |
| `alert` | bool | True if status is danger or prediction is anomaly |

### Tags
| Tag | Description |
|---|---|
| `patient_id` | UUID — isolates each patient's history |

### Retention
| Instance | Retention |
|---|---|
| Local InfluxDB | 7 days |
| InfluxDB Cloud | 30 days (free tier) |

---

## Local InfluxDB Docker Setup

```yaml
# docker-compose.yml
version: '3'
services:
  influxdb:
    image: influxdb:2.7.6
    ports:
      - "8087:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=adminpassword
      - DOCKER_INFLUXDB_INIT_ORG=health-org
      - DOCKER_INFLUXDB_INIT_BUCKET=health_local
      - DOCKER_INFLUXDB_INIT_RETENTION=168h
      - DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=medisync-local-token

  mosquitto:
    image: eclipse-mosquitto:2.0
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config/mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data

volumes:
  influxdb_data:
  mosquitto_data:
```

Mosquitto config (`mosquitto/config/mosquitto.conf`):
```
listener 1883
allow_anonymous true
```

Run: `docker compose up -d`
InfluxDB UI: `http://localhost:8087` (host port 8087 — 8086 occupied by another project)
MQTT broker: `localhost:1883` (anonymous access, LAN only)

---

## Async Cloud Sync

```python
# backend/local/sync.py
import asyncio

sync_queue = asyncio.Queue()

async def cloud_sync_worker(cloud_client):
    while True:
        reading = await sync_queue.get()
        try:
            await cloud_client.write(reading)
        except Exception:
            await sync_queue.put(reading)
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    asyncio.create_task(cloud_sync_worker(cloud_influx_client))
```

---

## Active Patient State (Local FastAPI)

```python
# main.py
app.state.active_patient_id = None

# readings.py
@app.post("/api/readings")
async def receive(reading, request: Request):
    patient_id = request.app.state.active_patient_id
    health_status = get_status(reading.spo2, reading.bpm, reading.temperature)

    point = Point("health_readings") \
        .tag("patient_id", patient_id) \
        .field("spo2", reading.spo2) \
        .field("bpm", reading.bpm) \
        .field("temperature", reading.temperature) \
        .field("status", health_status)
```

---

## Normal Value Ranges

| Metric | Normal | Warning | Critical |
|---|---|---|---|
| SpO₂ | 95–100% | 90–94% | < 90% |
| BPM (resting) | 60–100 | 40–60 or 100–130 | < 40 or > 130 |
| Temperature | 36.1–37.2°C | 37.3–38.0°C | > 38°C or < 35°C |

---

## ML Model (Phase 9)

### Goal
Detect subtle anomalies not caught by thresholds — unusual patterns within technically normal ranges.

### Algorithm
**XGBoost binary classifier** — `"High Risk"` / `"Low Risk"`.  
Trained on `ml/health_risk_ml.ipynb` (18-section pipeline, 200,020 rows from Kaggle).  
Externally validated on a separate hospital dataset (domain-shift test).  
5 models evaluated (XGBoost, LightGBM, CatBoost, MLP, RandomForest) — XGBoost won by composite scorecard.

### Features (5 — static per reading, no rolling window)
```python
features = [
  "BPM",            # Heart rate
  "Temperature",    # Body temp °C
  "SpO2",           # Oxygen saturation %
  "temp_deviation", # abs(Temperature - 37.0)
  "hr_spo2_ratio",  # BPM / SpO2
]
```

### Clinical Threshold
`0.5380` — Youden's J statistic, tuned on out-of-fold training predictions (no test-set leakage).  
`predict_proba(X)[0][0]` = P(High Risk). If ≥ 0.5380 → `"anomaly"`, else `"normal"`.

### Key Metrics
| Metric | Value |
|---|---|
| CV AUC (50 rounds, RepeatedStratifiedKFold 5×10) | 0.7144 ± 0.0025 |
| Clean Test AUC | 0.717 |
| Clean Test Recall | 0.4306 |
| External AUC (domain-shift) | 0.6975 |
| External Recall | 0.7183 |

### Artefacts (in `ml/`, gitignored — re-run notebook to regenerate)
| File | Purpose |
|---|---|
| `ml/health_risk_model.joblib` | Trained XGBoost model |
| `ml/health_risk_scaler.joblib` | StandardScaler (fit on train set only) |
| `ml/health_risk_label_encoder.joblib` | LabelEncoder — "High Risk" / "Low Risk" |
| `ml/model_metadata.json` | Audit trail + performance numbers |

### Integration
- `backend/local/ml/predict.py` — `load_model()` + `run_inference(artefacts, bpm, temp, spo2)`
- Loaded once at startup into `app.state.ml_model` (graceful: `None` if files missing)
- Runs alongside rule-based status on every `POST /api/readings`
- Result stored as `prediction` + `confidence` fields in both InfluxDB instances and SSE stream
- `confidence` = probability of the *predicted* class (always ≥ 0.5 on a positive decision)
- Shown as `AlertBadge` on bedside dashboard / `MLBadge` on admin patient detail (both separate from `StatusCard`)

### OOD Safety Override (`readings.py`)
The ML model was trained on in-range vitals (temperature ~36–40°C). Extreme out-of-distribution values — e.g. temperature 30°C (severe hypothermia), SpO₂ < 90%, BPM < 40 — fall outside the training distribution and the model cannot classify them reliably.

**Rule applied in `POST /api/readings` after inference:**
```python
if health_status == "danger" and prediction == "normal":
    prediction = "anomaly"
    confidence = round(1.0 - confidence, 4)  # flip to P(anomaly)
```
This ensures ML never contradicts an obvious danger already caught by the rule engine. The rule-based system handles known extreme thresholds; the ML handles subtle within-normal patterns. Showing "NORMAL" ML alongside a DANGER status is clinically misleading and erodes trust.

---

## Implementation Phases

---

### Phase 1 — Local InfluxDB Setup ✅
- [x] Install Docker Desktop on bedside machine
- [x] Create `docker-compose.yml`
- [x] Run `docker compose up -d`
- [x] Open `http://localhost:8087`, complete setup (port 8087 — 8086 occupied by another project)
- [x] Create bucket `health_local`, 7-day retention (auto-created via `DOCKER_INFLUXDB_INIT_*` env vars)
- [x] Generate API token, save to `backend/local/.env` (token: `medisync-local-token`, set via `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN`)
- [x] Test write + read with Python script (`backend/local/test_influx.py`)

**Done when:** Test point written and queried via Python.
**Completed:** 2026-05-11 — image pinned to `influxdb:2.7.6`; UI at `http://localhost:8087`.

---

### Phase 2 — InfluxDB Cloud Setup ✅
- [x] Sign up at `cloud2.influxdata.com` — Singapore region
- [x] Create bucket `health_cloud`, 30-day retention
- [x] Generate API token (write + read)
- [x] Save credentials to env files
- [x] Test write from local Python script

**Done when:** Test point appears in InfluxDB Cloud UI.
**Completed:** 2026-05-11 — Singapore region (ap-southeast-1); test script at `backend/local/test_influx_cloud.py`.

---

### Phase 3 — Supabase Setup ✅
- [x] Create Supabase project (Singapore region)
- [x] Run schema SQL in SQL editor
- [x] Enable Supabase Auth, create first admin account
- [x] Save `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- [x] Insert a test patient row

**Done when:** Patient table exists, admin can authenticate.
**Completed:** 2026-05-11 — project at `rzzxrlfgmkdoarglcpdw.supabase.co`; schema at `supabase/migrations/20260511000000_initial_schema.sql`; verified via `backend/local/test_supabase.py`.

---

### Phase 4 — Local FastAPI Backend ✅
- [x] Set up `backend/local/` — FastAPI, `influxdb-client`, `supabase-py`, `python-dotenv`
- [x] Implement `status.py` — `get_status(spo2, bpm, temperature)` returns `normal / warning / danger`
- [x] Implement `app.state.active_patient_id = None`
- [x] Implement `POST /api/patients` — register, Supabase row, open session, set active patient
- [x] Implement `POST /api/session/login` — validate IC + nurse password, open session, set active patient
- [x] Implement `POST /api/session/logout` — clear active patient, close session
- [x] Implement `GET /api/session/active` — return current patient or null
- [x] Implement `POST /api/readings` — run `get_status()`, tag with patient_id, write local InfluxDB, queue cloud sync
- [x] Implement `GET /api/stream` — SSE, stream latest reading every 1s including `status` field
- [x] Implement `cloud_sync_worker` background task
- [x] Add `X-Device-Secret` check in readings router
- [x] Test all endpoints with curl

**Done when:** POST reading → status calculated → stored in InfluxDB → appears in SSE stream.
**Completed:** 2026-05-11 — supabase client named `supabase_client.py` (avoids shadowing the `supabase` package); SSE stream reads from `app.state.last_reading` (updated on each POST /api/readings); all three status levels verified via curl.

---

### Phase 5 — Cloud FastAPI Backend ✅
- [x] Set up `backend/cloud/` — FastAPI, `influxdb-client`, `supabase-py`
- [x] Copy `status.py` from local backend
- [x] Implement Supabase Auth JWT middleware (`auth.py` — `require_auth` dependency, accepts Bearer header or `?token=` query param for SSE)
- [x] Implement `GET /api/patients`
- [x] Implement `GET /api/patients/:id`
- [x] Implement `GET /api/patients/:id/stream` — SSE includes `status` field, polls InfluxDB Cloud every 2s
- [x] Implement `GET /api/patients/:id/history` — `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- [x] Implement `GET /api/patients/:id/sessions`
- [x] Implement `GET /api/alerts` — includes joined patient name, ic_number, ward
- [x] Implement `PUT /api/alerts/resolve-all/{patient_id}` — bulk soft-resolve; sets `resolved_at` on all open alerts; returns `resolved_count`
- [x] Add CORS — configurable via `ALLOWED_ORIGINS` env var (comma-separated)
- [x] Deploy to Railway

**Done when:** Patient history + live stream queryable from Railway with valid auth token.

**Completed:** 2026-05-11 — deployed to Railway at `https://medisync-cloud-api-production.up.railway.app`; all env vars set in Railway dashboard; `/health` returns `{"status":"ok"}`; unauthenticated requests return 401 as expected.

---

### Phase 6 — Bedside Frontend (Next.js) ✅
- [x] Scaffold Next.js in `frontend/bedside/`
- [x] Set `NEXT_PUBLIC_API_URL=http://localhost:8000`
- [x] Build `/` index — New Patient / Existing Patient buttons
- [x] Build `/register` — patient registration form
- [x] Build `/login` — IC + nurse password
- [x] Build `proxy.ts` — redirect `/dashboard` → `/` if no active patient (Next.js 16 proxy convention replaces middleware.ts)
- [x] Build `StatusCard` component:
  - [x] Displays STATUS label and NORMAL / WARNING / DANGER
  - [x] Green for normal, amber for warning, red + pulse animation for danger
  - [x] Updates on every SSE event
- [x] Build `GaugeCard` — SpO₂, BPM, Temp with SVG arc gauge and colour coding
- [x] Build `LiveChart` — Recharts scrolling time-series, last 60 readings, tab per metric
- [x] Build `/dashboard` — StatusCard prominent at top, GaugeCards below, LiveChart below that
- [x] Add logout button — POST `/api/session/logout`, redirect to `/`
- [x] Run `npm run dev`

**Done when:** Full nurse flow — register → dashboard → StatusCard updates live → logout → index.
**Completed:** 2026-05-11 — Next.js 16 on `localhost:3001` (3000 occupied); uses `proxy.ts` named export instead of deprecated `middleware.ts`; dark navy UI with Framer Motion animations, SVG arc gauges, Recharts live chart with SpO₂/BPM/Temp tabs; SSE auto-reconnects after 3s; CORS updated in local backend to allow both ports 3000 and 3001; startup script at `start-bedside.sh`.

---

### Phase 7 — Admin Frontend (Next.js) ✅
- [x] Scaffold Next.js in `frontend/admin/`
- [x] Set `NEXT_PUBLIC_API_URL` to Railway URL
- [x] Build `/` login — Supabase Auth
- [x] Build `proxy.ts` — redirect to `/` if no session (Next.js 16 convention)
- [x] Build `/dashboard`:
  - [x] Summary cards (total patients, active sessions, unresolved alerts, critical count)
  - [x] Patients table with status column colour coded + search + ward filter
  - [x] "View" button per row
- [x] Build `/patient/[id]`:
  - [x] `StatusCard` (live, from cloud SSE via `?token=` query param)
  - [x] Live gauges + chart
  - [x] History chart with date picker
  - [x] Session log
  - [x] Alert log
- [x] Deploy to Vercel

**Done when:** Admin logs in, sees patient list, clicks View, sees live StatusCard + chart.

**Completed:** 2026-05-11 — Next.js 16 on `localhost:3002`; dark navy premium UI with Framer Motion, SVG arc gauges, Recharts; `proxy.ts` protects `/dashboard` and `/patient/*` via `sb-token` cookie; cloud SSE uses `?token=` query param; summary cards derived from patients + alerts + sessions; full search + status/ward filter in patient table; patient detail shows live SSE stream + history chart with date picker + session log + alert log. Deployed to `https://medi-sync-eta.vercel.app`. `vercel.json` declares `"framework": "nextjs"` so Vercel uses `.next/` output instead of `public/`. `export const dynamic = "force-dynamic"` on `/dashboard` and `/patient/[id]` prevents static prerendering of auth-gated pages.

---

### Phase 8 — ESP32 Firmware ⏳
- [x] Wire MAX30102 (I2C) and MLX90614ESF (I2C) to ESP32
- [x] Install libraries: `ArduinoJson`, `SparkFun MAX3010x`, `Adafruit MLX90614`
- [x] Implement `sensors.h` — `sensorsBegin()`, `sensorsUpdate()`, `readSpO2()`, `readBPM()`, `readTemperature()`
- [x] `i2c_scan` utility sketch — scan bus, print MAX30102 (0x57) and MLX90614 (0x5A)
- [x] Temperature retry — 3 attempts on transient I2C NaN before returning NaN
- [x] LED — green = OK (valid reading), red = error (sensor failure)
- [x] USB Serial transport — `firmware/serial_bridge.py` reads JSON from COM port, POSTs to FastAPI
- [x] Add Mosquitto broker service to `docker-compose.yml` + `mosquitto/config/mosquitto.conf`
- [x] Write `firmware/mqtt_bridge.py` — subscribes to `medisync/readings` + `medisync/status` (LWT), POSTs to FastAPI
- [ ] Install `PubSubClient` library for MQTT on ESP32
- [ ] Add WiFi credentials + MQTT broker IP to `firmware/main/config.h`
- [ ] Implement WiFi connection with auto-reconnect in `main.ino`
- [ ] Implement MQTT connection with LWT on `medisync/status` topic in `main.ino`
- [ ] Implement main loop every 1s — serialise JSON and publish to `medisync/readings`
- [ ] Include `device_secret` and `device_id` fields inside the JSON payload (MQTT has no HTTP headers)
- [ ] Update LED logic — green = WiFi + MQTT + sensor OK, red = any failure
- [ ] Flash, verify via MQTT broker logs and Serial Monitor
- [ ] Confirm readings in local InfluxDB with correct `patient_id` tag and `status` field

**Current transport (USB Serial):** `firmware/serial_bridge.py` reads JSON lines from the ESP32 over USB, POSTs to `localhost:8000/api/readings`. Detects disconnect via `SerialException` (USB pull) and 30-second idle timeout — both call `POST /api/device/disconnect` to close the session immediately.

**Target transport (WiFi MQTT):** ESP32 connects to Mosquitto on the bedside LAN and publishes readings every 1s. LWT configured on `medisync/status` — broker broadcasts `{"status":"offline"}` automatically if keepalive expires. `mqtt_bridge.py` catches this and calls `/api/device/disconnect`. MQTT was chosen for the FYP open-source pipeline requirement (O1/H1) and latency ~15–50ms.

**MQTT bridge usage (after WiFi firmware is flashed):**
```bash
cd firmware
pip install paho-mqtt requests
python mqtt_bridge.py   # subscribes to medisync/readings + medisync/status on localhost:1883
```

**Done when:** Bedside StatusCard and chart update every second with real sensor values via MQTT, and unplugging power closes the session within ~15s via LWT.

---

### Phase 8.5 — Claude API CDSS (AI Health Summary + Clinical Copilot) ✅
- [x] Add `anthropic>=0.40.0` to `backend/cloud/requirements.txt`
- [x] Implement `claude_service.py` with both sync (`_client`) and async (`_async_client`) Anthropic clients
- [x] `_compute_stats()` — aggregates per-metric min/max/avg/warning/danger counts from raw readings
- [x] `stream_generate_summary()` — async generator, yields text chunks; ephemeral prompt caching on system block
- [x] `analyze_alert_event()` — internally streams, collects via `get_final_text()`, validates all three emoji section markers (📥 🔍 ⚡), returns structured fallback if validation fails
- [x] `stream_chat_followup()` — async generator for multi-turn follow-up; two-block caching (static role block cached, dynamic alert context not cached)
- [x] `_build_event_context()` — pre-computes cross-metric correlations, trend direction, and formatted stats before any Claude call (never sends raw reading arrays to the model)
- [x] Upgrade `GET /api/patients/:id/summary` to SSE stream — emits `meta` + `chunk` + `done` events; TTFB < 500ms
- [x] Implement `POST /api/copilot/analyze` — buffered JSON (full response needed for section validation)
- [x] Implement `POST /api/copilot/chat` — SSE stream with `X-Accel-Buffering: no` header (disables Railway nginx proxy buffer)
- [x] Register `copilot.router` in `backend/cloud/main.py`
- [x] Build `AISummaryPanel` component — consumes SSE stream, shows period badge + reading count from `meta` event while text arrives
- [x] Build `ClinicalCopilot` component — sliding drawer chatbox:
  - `BubbleContent` renderer handles emoji headers, bullet points, and paragraphs
  - AI / User chat bubbles with timestamps
  - Animated typing indicator (3-dot bounce) shown until first token arrives
  - Auto-scroll to bottom on new messages; jump-to-bottom button when scrolled up
  - Auto-resizing textarea input; Enter to send, Shift+Enter for newline
- [x] Wire `ClinicalCopilot` into alert log on `/patient/[id]` — "Check" button per alert row opens the drawer
- [x] Refactored ClinicalCopilot trigger into a two-stage spatial flow: Stage 1 = "Check" zooms `HistoryChart` + pre-fetches readings slice into `pendingAlert`; Stage 2 = clicking the red markArea opens the drawer + triggers AI analysis
- [x] Add `readSSEStream()` helper + `streamCopilotChat()` + `streamAISummary()` to `frontend/admin/lib/api.ts`
- [x] Set `ANTHROPIC_API_KEY` in Railway dashboard

**Prompt caching strategy:**
- Summary system block: single ephemeral block, identical across all patients/ranges → cached after first hit within 5-min TTL
- Copilot initial analysis system block: `_SYSTEM_COPILOT_INITIAL` (~400 tokens), marked ephemeral → 0 input tokens on repeated "Check" clicks within TTL
- Copilot chat: two-block system — static role block (ephemeral, cached) + dynamic alert context (not cached). ~120 tokens saved per follow-up turn.

**Output validation (copilot analyze only):**
`_validate_analysis()` checks that all three emoji markers (📥 🔍 ⚡) are present before returning. If any are missing, returns `_FALLBACK_ANALYSIS` — a pre-formatted three-section message explaining the formatting failure — rather than broken partial output.

**Done when:** Clinician clicks Generate Summary and sees text stream in; clinician clicks Check on an alert, sees three-section analysis, and can ask follow-up questions with answers streaming token-by-token.

**Completed:** 2026-05-28 — model: `claude-haiku-4-5-20251001`; both summary and chat fully streamed via SSE; `ClinicalCopilot` drawer wired to alert log; prompt caching active on all three call paths.

---

### Phase 9 — ML Anomaly Detection ✅
- [x] Collect 500+ readings — used `ml/health_risk_ml.ipynb` on `human_vital_signs_dataset_2024.csv` (200,020 rows, Kaggle)
- [x] External domain-shift validation — `patients_data_with_alerts.xlsx` (~50,000 rows, never trained on)
- [x] Feature engineering — 5 static features: BPM, Temperature, SpO₂, temp_deviation, hr_spo2_ratio
- [x] Train 5 models (XGBoost, LightGBM, CatBoost, MLP, RandomForest) with `RepeatedStratifiedKFold(5×10)`
- [x] Evaluate — XGBoost selected via composite scorecard (CV AUC 0.7144, External Recall 0.7183)
- [x] Clinical threshold tuning — Youden's J → 0.5380 (OOF-tuned, no test leakage)
- [x] Probability calibration — Isotonic Regression on CV folds
- [x] Artefacts saved: `ml/health_risk_model.joblib`, `ml/health_risk_scaler.joblib`, `ml/health_risk_label_encoder.joblib`
- [x] Load at FastAPI startup into `app.state.ml_model` — `backend/local/main.py`
- [x] Run inference in `POST /api/readings` — `prediction` + `confidence` fields stored in both InfluxDB instances and returned in SSE stream
- [x] Show `AlertBadge` on bedside dashboard alongside `StatusCard`
- [x] Show `MLBadge` on admin patient detail alongside `StatusCard`

Note: `StatusCard` (rule-based) is already live from Phase 4. ML `AlertBadge`/`MLBadge` is an additive layer.  
Model differs from original plan — XGBoost (supervised) used instead of Isolation Forest (unsupervised); performs better on this labelled dataset.  
Features are static per-reading (no rolling window needed — model was trained on static features).  
Graceful degradation: if `ml/*.joblib` files are missing, `prediction` defaults to `"normal"`, `confidence` to `0.0`.

**Done when:** `POST /api/readings` returns `prediction: "anomaly"` + `confidence` when vitals show stress pattern; bedside `AlertBadge` and admin `MLBadge` update on every SSE event.

**Completed:** 2026-05-26 — XGBoost (CV AUC 0.7144 ± 0.0025); artefacts in `ml/`; `backend/local/ml/predict.py`; `confidence` field in SSE stream + InfluxDB; bedside `AlertBadge`; admin `MLBadge`.

---

### Phase 10 — Polish & Hardening ✅
- [x] Persist sync queue to local SQLite — survive server restarts (`sync.py` — `pending_sync` table, crash-recovery on startup)
- [x] Frontend SSE auto-reconnect after 3s (both bedside and admin `StatusCard.hooks.ts`)
- [x] Alert writes to Supabase `alerts` table when status = danger or ML prediction = anomaly
- [x] Admin dashboard shows unresolved alert count in nav (pulsing red badge, hides when zero)
- [x] Add `/health` endpoint to both FastAPI instances
- [x] Rate limiting on local API (5 req/s) — `slowapi`, applied to `POST /api/readings`
- [x] README in each subfolder (`firmware/`, `backend/local/`, `backend/cloud/`, `frontend/bedside/`, `frontend/admin/`, `ml/`)

**Completed:** 2026-05-26 — SQLite persistence via `sync_queue.db` with crash-recovery; `slowapi` rate limiter on readings endpoint; alert count badge in admin navbar (pulsing red, hidden when zero); project-level READMEs for all subfolders.

---

### Phase 11 — Session Lifecycle Management ✅
- [x] Add `duration_seconds INTEGER` and `closed_reason TEXT` columns — `supabase/migrations/20260528000000_sessions_duration.sql` (run in Supabase SQL editor)
- [x] Fix `open_session()` — mutual exclusion: closes any dangling open sessions before inserting a new one, preventing ghost active-session rows on re-login without logout
- [x] Fix `close_active_session()` — fetches `started_at`, computes `int((now - started_at).total_seconds())`, writes `duration_seconds` + `closed_reason` in the same update; accepts `reason` param (`"manual_logout"` default)
- [x] Add `app.state.last_reading_at` — `datetime` stamped on every successful `POST /api/readings`
- [x] Add `_heartbeat_watchdog()` background task in `main.py` — polls every 10s; if no reading for 300s (5 min) with an active patient, calls `close_active_session(..., reason="auto_timeout")` and clears state. Safety net only — explicit disconnect notifications fire first.
- [x] Create `routers/device.py` — `POST /api/device/disconnect` closes session immediately with `reason="device_disconnect"`, clears all in-memory state
- [x] Update `routers/readings.py` — stamp `app.state.last_reading_at = ts` on each accepted reading
- [x] Update `routers/session.py` logout — passes `reason="manual_logout"`, clears `last_reading_at`
- [x] Update `firmware/serial_bridge.py` — two-layer disconnect detection:
  - `SerialException` (USB pull / OS port revoke) → calls `notify_disconnect()` once, sets `device_offline = True`; resets when device reconnects
  - 30-second idle timeout (port open but no bytes at all) → same `notify_disconnect()` call, same de-duplication flag
- [x] Create `firmware/mqtt_bridge.py` (Phase 8 WiFi bridge) — subscribes to `medisync/status`; on `{"status":"offline"}` LWT → calls `notify_disconnect()` immediately; `loop_forever()` auto-reconnects on broker blips

**Three-layer disconnect safety net (ordered by how quickly they fire):**
1. Bridge explicit notify (serial `SerialException` or MQTT LWT) — fires within seconds of device loss
2. Bridge idle timeout (`serial_bridge.py`) — fires after 30s of total serial silence
3. FastAPI heartbeat watchdog — fires after 300s of no valid readings; catches bridge crashes

**Done when:** Pulling the ESP32 power cord closes the session within 30s with accurate `ended_at`, `duration_seconds`, and `closed_reason = "device_disconnect"`. A new login never sees a dangling open session from the previous connection.

**Completed:** 2026-05-29 — migration file created; `supabase_client.py` ghost-session fix + duration tracking; `_heartbeat_watchdog` running at startup; `POST /api/device/disconnect` endpoint live; `serial_bridge.py` and `mqtt_bridge.py` both wired to notify on disconnect.

---

## Deployment Reference

### Bedside Machine
```bash
# One-command start (recommended)
./start-bedside.sh

# Manual
docker compose up -d          # starts InfluxDB + Mosquitto
cd backend/local && uvicorn main:app --host 0.0.0.0 --port 8000
cd frontend/bedside && npm run dev

# Start MQTT bridge (after flashing ESP32 and connecting to WiFi)
cd firmware && python mqtt_bridge.py
```

### Railway (Cloud Backend)
- Root directory: `/backend/cloud`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all cloud env vars in Railway dashboard

### Vercel (Admin Frontend)
- Root directory: `/frontend/admin`
- Framework: Next.js (declared in `vercel.json`)
- Set `NEXT_PUBLIC_API_URL` and Supabase keys

---

## Notes for Claude Code

- `model.pkl` is gitignored — retrain locally after cloning
- ML model loaded once at startup (`app.state.ml_model`), never per-request
- `app.state.active_patient_id` is in-memory — restarting local FastAPI clears it, nurse must log in again
- `app.state.last_reading_at` is the heartbeat timestamp — set on every accepted `POST /api/readings`; `None` if no reading yet or after session close
- `status.py` is identical in both local and cloud backends — keep them in sync manually or extract to a shared `lib/` folder
- Rule-based `StatusCard` works from Phase 4 with zero ML — do not block it on Phase 9
- ML features are **static per-reading** (no rolling window) — BPM, Temperature, SpO₂, temp_deviation, hr_spo2_ratio
- OOD safety override: if `health_status == "danger"` and ML says `"normal"`, `readings.py` forces `prediction = "anomaly"` and flips confidence — do not remove this guard
- `confidence` must flow through all four downstream steps: `write_reading()`, `enqueue_reading()`, `last_reading` state, and the return payload — removing it breaks the SSE stream and InfluxDB records
- SSE endpoints must set `Content-Type: text/event-stream` and disable response buffering
- Never use `time.sleep()` in async FastAPI — always `asyncio.sleep()`
- Both Next.js apps are fully independent — separate `package.json`, separate deploys
- ESP32 currently sends data via USB Serial; `serial_bridge.py` reads and POSTs to FastAPI — WiFi MQTT (Phase 8) is not yet flashed
- MQTT topic is `medisync/readings`; LWT topic is `medisync/status`; `device_secret` is embedded in the JSON payload (MQTT has no HTTP headers)
- Mosquitto runs in Docker alongside InfluxDB — `docker compose up -d` starts both
- Local InfluxDB runs on host port **8087** (container port 8086) — UI at `http://localhost:8087`
- InfluxDB Cloud free tier: 5MB/5min write limit, 30-day retention — sufficient for prototype
- Nurse password is a single shared secret in `.env` — not per-nurse, not stored in DB
- Cloud backend on Railway needs `CLOUD_INFLUX_ORG` and `CLOUD_INFLUX_BUCKET` set explicitly — they do not default
- `claude_service.py` pre-computes stats in Python before calling the API — never send raw reading arrays to the model
- `ANTHROPIC_API_KEY` is read by the Anthropic SDK automatically from the environment — no explicit `os.getenv` needed in `claude_service.py`
- AI summary requires at least 2 readings for the selected period; returns HTTP 422 otherwise
- Summary and copilot/chat endpoints both use `asyncio.AsyncAnthropic()` + `messages.stream()` for true token streaming — do not replace with `asyncio.to_thread(_client.messages.create)`
- `analyze_alert_event()` uses the sync client internally (streams to collect full text for validation) but is called via `asyncio.to_thread` from the FastAPI handler
- `ClinicalCopilot` `BubbleContent` renderer requires all three emoji markers (📥 🔍 ⚡) — `_validate_analysis()` guards against malformed output; never bypass this validation
- ClinicalCopilot uses a **two-stage interaction** — do not merge them: Stage 1 ("Check" click) zooms `HistoryChart` and populates `pendingAlert: { alert, readingsSlice }`; Stage 2 (markArea click) reads `pendingAlert`, opens the drawer, and calls `/api/copilot/analyze`. The drawer must NOT open on the "Check" click.
- `pendingAlert` is `null` while history is loading and is reset when a new "Check" is clicked. `onMarkAreaClick` is only wired to `HistoryChart` when `pendingAlert !== null`, so the markArea is non-interactive during the history fetch.
- `HistoryChart` markArea `silent` is `false` and `cursor: 'pointer'` is applied only when `onMarkAreaClick` prop is defined. ECharts fires `params.componentType === 'markArea'` on markArea click — this is checked in the `onEvents.click` handler inside `HistoryChart.tsx`.
- Session `closed_reason` values are a controlled vocabulary: `"manual_logout"` | `"device_disconnect"` | `"auto_timeout"` — use these exact strings everywhere
- `PUT /api/alerts/resolve-all/{patient_id}` **only sets `resolved_at`** — never DELETE rows; the full alert history is a medical audit trail. The frontend uses an optimistic update (`setAlertLog` → map unresolved rows to `resolved_at: now`) so the table clears instantly without a re-fetch.
- `TableCard` in `page.tsx` accepts optional `onBadgeClick` + `badgeDisabled` props; when `onBadgeClick` is provided it renders the badge as a `<button>` instead of a `<span>`. The Alert Log passes `onBadgeClick={handleResolveAll}` only when `unresolvedCount > 0`, so the badge is non-interactive (static `<span>`) when all alerts are already resolved.
- `open_session()` always calls `close_active_session()` first — this is the ghost session guard; do not remove it
- The Phase 11 migration (`20260528000000_sessions_duration.sql`) must be run in the Supabase SQL editor before deploying the new `supabase_client.py`
