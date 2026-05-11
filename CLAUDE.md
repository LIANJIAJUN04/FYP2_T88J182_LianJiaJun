# CLAUDE.md — Wearable Health Monitor

## Project Overview

A real-time IoT patient health monitoring system. An ESP32 with SpO₂, BPM, and temperature sensors is connected via USB to a bedside machine. Readings are written locally for near-zero latency bedside display, and synced asynchronously to the cloud for remote admin monitoring. Each patient has their own session and isolated reading history in InfluxDB via `patient_id` tagging.

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

## Full Stack

| Layer | Tech | Where |
|---|---|---|
| Firmware | ESP32, Arduino framework | Device |
| Local backend | FastAPI | Bedside machine (localhost:8000) |
| Cloud backend | FastAPI | Railway |
| Time-series (local) | InfluxDB via Docker | Bedside machine (localhost:8086) |
| Time-series (cloud) | InfluxDB Cloud (Singapore region) | Cloud |
| Relational DB | Supabase Postgres | Cloud |
| Auth | Supabase Auth (admin) + shared nurse password (bedside) | Cloud |
| Bedside frontend | Next.js | localhost:3000 |
| Admin frontend | Next.js | Vercel |

---

## User Flow

### Index Page (`/`)
Two buttons — **Patient** or **Admin**. This is the root of both apps but behaves differently:
- Bedside app (`localhost:3000`) — shows Patient button only
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
// middleware.ts
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
                                          session log
                                          alert log
```

---

## Monorepo Structure

```
wearable-health/
├── firmware/
│   ├── main.ino
│   ├── config.h                     # API URL, device ID, WiFi creds
│   └── sensors.h                    # readSpO2(), readBPM(), readTemperature()
│
├── backend/
│   ├── local/                       # Runs on bedside machine
│   │   ├── main.py                  # FastAPI app, holds active_patient_id state
│   │   ├── database.py              # Local InfluxDB client
│   │   ├── supabase.py              # Supabase client (patient + session ops)
│   │   ├── sync.py                  # Async queue + cloud sync worker
│   │   ├── status.py                # Rule-based status logic
│   │   ├── routers/
│   │   │   ├── readings.py          # POST /api/readings
│   │   │   ├── stream.py            # GET /api/stream (SSE)
│   │   │   ├── patients.py          # POST /api/patients (register)
│   │   │   └── session.py           # POST /api/session/login, /logout, GET /active
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
│       ├── routers/
│       │   ├── patients.py          # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py            # GET /api/patients/:id/stream (SSE)
│       │   ├── history.py           # GET /api/patients/:id/history
│       │   ├── sessions.py          # GET /api/patients/:id/sessions
│       │   └── alerts.py            # GET /api/alerts
│       └── requirements.txt
│
├── frontend/
│   ├── bedside/                     # Next.js — localhost
│   │   ├── app/
│   │   │   ├── page.tsx             # Index — New Patient / Existing Patient
│   │   │   ├── register/page.tsx    # New patient registration form
│   │   │   ├── login/page.tsx       # Existing patient — IC + nurse password
│   │   │   └── dashboard/page.tsx   # StatusCard + GaugeCards + LiveChart
│   │   ├── components/
│   │   │   ├── StatusCard/
│   │   │   │   ├── StatusCard.tsx   # Markup only — big colour-coded status display
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
│   │   ├── middleware.ts
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
│       │   └── AlertBadge/
│       ├── middleware.ts
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
│       └── 20260511000000_initial_schema.sql   # patients, sessions, alerts
│
├── docker-compose.yml
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

### Status vs ML Prediction — Two Separate Things

| | Rule-based Status | ML Anomaly Detection (Phase 9) |
|---|---|---|
| Logic | Simple if/else thresholds | Trained model on patterns |
| Available | Phase 4 | Phase 9 |
| What it catches | Known dangerous values | Subtle patterns within normal range |
| Example | SpO₂ = 88% → danger | SpO₂ fluctuating abnormally fast at 95% |
| Displayed as | `StatusCard` — NORMAL / WARNING / DANGER | `AlertBadge` — normal / anomaly |

Both are shown on the dashboard. StatusCard is always available from Phase 4 onwards.

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
  "alert": false,
  "ts": "2025-05-06T10:00:01Z"
}
```

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
LOCAL_INFLUX_URL=http://localhost:8086
LOCAL_INFLUX_TOKEN=your-local-token
LOCAL_INFLUX_ORG=your-org
LOCAL_INFLUX_BUCKET=health_local

CLOUD_INFLUX_URL=https://ap-southeast-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=your-cloud-org
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

NURSE_PASSWORD=shared-nurse-password
DEVICE_SECRET=shared-secret-for-esp32
```

### Cloud Backend (`backend/cloud/.env` / Railway)
```env
CLOUD_INFLUX_URL=https://ap-southeast-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=your-cloud-org
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### Bedside Frontend (`frontend/bedside/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Admin Frontend (`frontend/admin/.env.local`)
```env
NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Firmware (`firmware/config.h`)
```cpp
#define API_URL       "http://192.168.x.x:8000"
#define DEVICE_ID     "esp32-001"
#define DEVICE_SECRET "shared-secret-for-esp32"
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
{ "status": "ok", "health_status": "normal", "prediction": "normal", "alert": false }
```

Internally: run `get_status()`, write to local InfluxDB with `status` field + `patient_id` tag, run ML inference, queue cloud sync.

#### GET `/api/stream`
```
data: {"spo2":97.5,"bpm":72,"temperature":36.6,"status":"normal","prediction":"normal","alert":false,"ts":"..."}
```

---

### Cloud FastAPI (Railway)

#### GET `/api/patients` — list all patients (auth required)
#### GET `/api/patients/:id` — single patient details
#### GET `/api/patients/:id/stream` — SSE live stream (includes status field)
#### GET `/api/patients/:id/history` — `?from=2025-05-01&to=2025-05-06`
#### GET `/api/patients/:id/sessions` — session log
#### GET `/api/alerts` — alert log from Supabase

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
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID REFERENCES patients(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ     -- NULL means currently active
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
    image: influxdb:2
    ports:
      - "8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=adminpassword
      - DOCKER_INFLUXDB_INIT_ORG=health-org
      - DOCKER_INFLUXDB_INIT_BUCKET=health_local
      - DOCKER_INFLUXDB_INIT_RETENTION=168h

volumes:
  influxdb_data:
```

Run: `docker compose up -d`
UI: `http://localhost:8086`

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
- **Phase 1 (no labels):** Isolation Forest
- **Phase 2 (labeled):** Random Forest classifier

### Features
```python
features = [
  "spo2", "bpm", "temperature",
  "spo2_rolling_mean_5",
  "bpm_rolling_std_5",
  "temp_delta",
]
```

### Integration
- Loaded once at startup into `app.state.model`
- Runs alongside rule-based status on every reading
- Result stored as `prediction` field in InfluxDB
- Shown as `AlertBadge` on dashboard (separate from `StatusCard`)

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

### Phase 4 — Local FastAPI Backend
- [ ] Set up `backend/local/` — FastAPI, `influxdb-client`, `supabase-py`, `python-dotenv`
- [ ] Implement `status.py` — `get_status(spo2, bpm, temperature)` returns `normal / warning / danger`
- [ ] Implement `app.state.active_patient_id = None`
- [ ] Implement `POST /api/patients` — register, Supabase row, open session, set active patient
- [ ] Implement `POST /api/session/login` — validate IC + nurse password, open session, set active patient
- [ ] Implement `POST /api/session/logout` — clear active patient, close session
- [ ] Implement `GET /api/session/active` — return current patient or null
- [ ] Implement `POST /api/readings` — run `get_status()`, tag with patient_id, write local InfluxDB, queue cloud sync
- [ ] Implement `GET /api/stream` — SSE, stream latest reading every 1s including `status` field
- [ ] Implement `cloud_sync_worker` background task
- [ ] Add `X-Device-Secret` middleware
- [ ] Test all endpoints with curl / Postman

**Done when:** POST reading → status calculated → stored in InfluxDB → appears in SSE stream.

---

### Phase 5 — Cloud FastAPI Backend
- [ ] Set up `backend/cloud/` — FastAPI, `influxdb-client`, `supabase-py`
- [ ] Copy `status.py` from local backend
- [ ] Implement Supabase Auth JWT middleware
- [ ] Implement `GET /api/patients`
- [ ] Implement `GET /api/patients/:id`
- [ ] Implement `GET /api/patients/:id/stream` — SSE includes `status` field
- [ ] Implement `GET /api/patients/:id/history`
- [ ] Implement `GET /api/patients/:id/sessions`
- [ ] Implement `GET /api/alerts`
- [ ] Add CORS (allow Vercel domain)
- [ ] Deploy to Railway

**Done when:** Patient history + live stream queryable from Railway with valid auth token.

---

### Phase 6 — Bedside Frontend (Next.js)
- [ ] Scaffold Next.js in `frontend/bedside/`
- [ ] Set `NEXT_PUBLIC_API_URL=http://localhost:8000`
- [ ] Build `/` index — New Patient / Existing Patient buttons
- [ ] Build `/register` — patient registration form
- [ ] Build `/login` — IC + nurse password
- [ ] Build `middleware.ts` — redirect `/dashboard` → `/` if no active patient
- [ ] Build `StatusCard` component:
  - [ ] Displays STATUS label and NORMAL / WARNING / DANGER
  - [ ] Green for normal, amber for warning, red + pulse animation for danger
  - [ ] Updates on every SSE event
- [ ] Build `GaugeCard` — SpO₂, BPM, Temp with colour coding
- [ ] Build `LiveChart` — Recharts scrolling time-series, last 60 readings
- [ ] Build `/dashboard` — StatusCard prominent at top, GaugeCards below, LiveChart below that
- [ ] Add logout button — POST `/api/session/logout`, redirect to `/`
- [ ] Run `npm run dev`

**Done when:** Full nurse flow — register → dashboard → StatusCard updates live → logout → index.

---

### Phase 7 — Admin Frontend (Next.js)
- [ ] Scaffold Next.js in `frontend/admin/`
- [ ] Set `NEXT_PUBLIC_API_URL` to Railway URL
- [ ] Build `/` login — Supabase Auth
- [ ] Build `middleware.ts` — redirect to `/` if no session
- [ ] Build `/dashboard`:
  - [ ] Summary cards (total patients, active sessions, unresolved alerts, critical count)
  - [ ] Patients table with status column colour coded
  - [ ] "View" button per row
- [ ] Build `/patient/[id]`:
  - [ ] `StatusCard` (live, from cloud SSE)
  - [ ] Live gauges + chart
  - [ ] History chart with date picker
  - [ ] Session log
  - [ ] Alert log
- [ ] Deploy to Vercel

**Done when:** Admin logs in, sees patient list, clicks View, sees live StatusCard + chart.

---

### Phase 8 — ESP32 Firmware
- [ ] Wire MAX30102 (I2C) and DS18B20 (OneWire) to ESP32
- [ ] Install libraries: `ArduinoJson`, `SparkFun MAX3010x`, `DallasTemperature`
- [ ] Implement `sensors.h` — `readSpO2()`, `readBPM()`, `readTemperature()`
- [ ] Implement main POST loop every 1s
- [ ] Add `X-Device-Secret` header
- [ ] LED — green = OK, red = error
- [ ] Retry — 3 attempts per reading
- [ ] Flash, verify in Serial Monitor
- [ ] Confirm readings in local InfluxDB with correct `patient_id` tag and `status` field

**Core loop:**
```cpp
void loop() {
  StaticJsonDocument<200> doc;
  doc["spo2"]        = readSpO2();
  doc["bpm"]         = readBPM();
  doc["temperature"] = readTemperature();
  doc["timestamp"]   = millis() / 1000;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(API_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  http.POST(body);
  http.end();

  delay(1000);
}
```

**Done when:** Bedside StatusCard and chart update every second with real sensor values.

---

### Phase 9 — ML Anomaly Detection
- [ ] Collect 500+ readings across sessions (rest, movement, post-exercise)
- [ ] Export from InfluxDB to `ml/data/readings.csv`
- [ ] Engineer rolling features in `collect_data.ipynb`
- [ ] Train Isolation Forest (`contamination=0.05`) in `train_model.ipynb`
- [ ] Evaluate — target < 5% false positive on normal data
- [ ] `joblib.dump(model, "backend/local/ml/model.pkl")`
- [ ] Load at FastAPI startup into `app.state.model`
- [ ] Run inference in `POST /api/readings`, store as `prediction` field in InfluxDB
- [ ] Show `AlertBadge` on dashboard alongside `StatusCard`

Note: `StatusCard` (rule-based) is already live from Phase 4. ML `AlertBadge` is an additive layer.

**Done when:** Covering sensor triggers both DANGER on StatusCard and anomaly on AlertBadge.

---

### Phase 10 — Polish & Hardening
- [ ] Persist sync queue to local SQLite — survive server restarts
- [ ] Frontend SSE auto-reconnect after 3s
- [ ] Alert writes to Supabase `alerts` table when status = danger
- [ ] Admin dashboard shows unresolved alert count in nav
- [ ] Add `/health` endpoint to both FastAPI instances
- [ ] Rate limiting on local API (5 req/s)
- [ ] README in each subfolder

---

## Deployment Reference

### Bedside Machine
```bash
docker compose up -d
cd backend/local && uvicorn main:app --host 0.0.0.0 --port 8000
cd frontend/bedside && npm run dev
```

### Railway (Cloud Backend)
- Root directory: `/backend/cloud`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all cloud env vars in Railway dashboard

### Vercel (Admin Frontend)
- Root directory: `/frontend/admin`
- Framework: Next.js
- Set `NEXT_PUBLIC_API_URL` and Supabase keys

---

## Notes for Claude Code

- `model.pkl` is gitignored — retrain locally after cloning
- ML model loaded once at startup (`app.state.model`), never per-request
- `app.state.active_patient_id` is in-memory — restarting local FastAPI clears it, nurse must log in again
- `status.py` is identical in both local and cloud backends — keep them in sync manually or extract to a shared `lib/` folder
- Rule-based `StatusCard` works from Phase 4 with zero ML — do not block it on Phase 9
- Rolling features require querying last 5 readings from local InfluxDB before ML inference
- SSE endpoints must set `Content-Type: text/event-stream` and disable response buffering
- Never use `time.sleep()` in async FastAPI — always `asyncio.sleep()`
- Both Next.js apps are fully independent — separate `package.json`, separate deploys
- ESP32 connects via local WiFi (same network as bedside machine), not USB serial for HTTP
- InfluxDB Cloud free tier: 5MB/5min write limit, 30-day retention — sufficient for prototype
- Nurse password is a single shared secret in `.env` — not per-nurse, not stored in DB
