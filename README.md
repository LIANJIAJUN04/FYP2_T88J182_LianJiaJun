# REAL-TIME HEALTH MONITORING VIA WEARABLE IOT WITH CLOUD ANALYTICS

<div align="center">

![Academic Project](https://img.shields.io/badge/Academic-Final%20Year%20Project-blue?style=flat-square)
![Healthcare IoT](https://img.shields.io/badge/Healthcare-IoT-red?style=flat-square)
![Cloud Analytics](https://img.shields.io/badge/Cloud-Analytics-orange?style=flat-square)
![Real-Time](https://img.shields.io/badge/Real--Time-Monitoring-green?style=flat-square)
![Open Source](https://img.shields.io/badge/Pipeline-Open%20Source-brightgreen?style=flat-square)

</div>

---

## 🏥 Overview

A real-time IoT patient health monitoring system designed for clinical bedside and remote administrator use. An **ESP32** wearable device equipped with SpO₂, BPM, and body temperature sensors transmits readings every second via WiFi using the MQTT protocol to a bedside Mosquitto broker.

Readings are written to a local InfluxDB instance for low-latency bedside display and synced asynchronously to the cloud for remote admin monitoring. An **XGBoost ML anomaly detection** model runs on every reading at the bedside gateway, while a **Claude API–powered Clinical Decision Support System (CDSS)** provides on-demand streaming AI health summaries and per-alert root-cause analysis for administrators.

The system operates across two independent display modes with empirically measured and validated performance:

| | 🩺 Bedside | ☁️ Admin (Cloud) |
|---|---|---|
| Connection | WiFi + MQTT → bedside machine | Internet, anywhere |
| Latency | Mean **620 ms** · P95 **1 173 ms** (measured) | Mean **1 040 ms** · P95 **1 918 ms** (measured) |
| Auth | Shared nurse password | Supabase Auth (email + password) |
| Frontend | Next.js on `localhost:3001` | Next.js on Vercel |
| Reads from | Bedside InfluxDB | InfluxDB Cloud |
| Backend | FastAPI on `localhost:8000` | FastAPI on Railway |

---

## ✨ Features

### ⚡ Real-Time Monitoring
- Live SpO₂, BPM, and body temperature readings streamed via Server-Sent Events (SSE) at 1 Hz
- Rule-based status engine classifies every reading as **NORMAL / WARNING / DANGER** in real time
- Bedside dashboard updates every second with animated `StatusCard`, SVG arc gauges, and scrolling time-series chart

### 🤖 ML Anomaly Detection
- **XGBoost classifier** trained on 200,020 vital-sign readings detects subtle physiological patterns within technically normal ranges
- 5 static features per reading: BPM, Temperature, SpO₂, `temp_deviation`, `hr_spo2_ratio`
- Clinical threshold tuned via Youden's J (0.5380) with no test-set leakage
- CV AUC: 0.7144 ± 0.0025 · External (domain-shift) AUC: 0.6975
- OOD safety override: if rule-based status is DANGER and ML says NORMAL, ML prediction is forced to ANOMALY

### 🩺 AI Clinical Decision Support (CDSS)
- **AI Health Summary** — streaming narrative powered by `claude-haiku-4-5`; clinician selects 1 h / 6 h / 24 h / 7 d window, receives structured SpO₂ / BPM / temperature analysis with actionable attention points
- **Clinical Copilot** — per-alert root-cause analysis (three-section structured report: What Happened / Root Cause Hypothesis / Recommended Next Steps) with multi-turn streaming follow-up chat
- Two-stage interaction flow: Stage 1 zooms HistoryChart to the alert window; Stage 2 opens the AI drawer on markArea click

### 🔔 Alert Notifications
- Instant **Telegram** and/or **SMTP email** notifications on every new danger or ML anomaly event
- Fire-and-forget via `asyncio.create_task` — ESP32 response never delayed
- Built-in cooldown: `upsert_alert` deduplication suppresses repeat notifications within the same event window

### 🔒 Multi-Layer Security
- ESP32 authenticated via `X-Device-Secret` header on every reading POST
- Bedside sessions authenticated via IC number + shared nurse password
- Cloud API protected by Supabase Auth JWT middleware on all endpoints
- SSE endpoints accept `?token=` query parameter (browsers cannot set headers on `EventSource`)

### 📡 MQTT Transport with LWT
- ESP32 publishes to `medisync/readings` every second; Last Will and Testament configured on `medisync/status`
- Session auto-closes within ~22 s of device power loss via MQTT LWT → `POST /api/device/disconnect`
- 5-minute heartbeat watchdog in FastAPI catches cases where the bridge crashes without sending LWT

### 🛡️ Offline Resilience
- SQLite `sync_queue.db` buffers unsynced readings when Railway or InfluxDB Cloud is unavailable
- Bedside data path (ESP32 → Mosquitto → FastAPI → local InfluxDB) has zero cloud dependency
- SSE auto-reconnects after 3 s on both bedside and admin frontends
- Crash-recovery: pending rows are replayed from SQLite in order on FastAPI restart

### 📊 Admin Dashboard
- Summary cards: Total Patients, Active Sessions, Patients Requiring Attention (context-aware), Critical Patients
- Patient table with live status colour-coding, search, and ward/status filter
- Per-patient detail: live gauges, live SSE chart, history chart with date picker, session log, alert log
- Bulk alert resolution via **"All clear"** button — soft-resolves (never deletes) all open alerts; full audit trail preserved
- Admin live session badge auto-detects device offline via stale SSE `ts` (>15 s) and switches to 5 s polling

### 📈 Empirical Validation
All three research hypotheses and five objectives are supported with measured data stored in `measurements/`:

| | Statement | Verdict | Key Metric |
|---|---|---|---|
| **H1** | Bedside path achieves real-time performance (SLA: P95 < 2 000 ms) | ✅ Supported | P95 = 1 172.5 ms — 600 samples |
| **H2** | Hybrid edge–cloud achieves lower latency than cloud-only path | ✅ Supported | 1.68× lower mean (620 ms vs 1 040 ms) |
| **H3** | Bedside monitoring survives cloud outages and backend restarts | ✅ Supported | 100% SSE uptime (60/60); SQLite crash-recovery proven |
| **O1** | Alert notifications delivered within seconds, non-blocking, deduplicated | ✅ Supported | API response 100–180 ms |
| **O2** | Independent authentication enforced at every access boundary | ✅ Supported | All 6 boundary tests pass; local rejections < 2 ms |
| **O3** | Full pipeline implemented exclusively on open-source components | ✅ Supported | 13 components — MIT / Apache 2.0 / EPL |
| **O4** | AI CDSS streaming TTFB within threshold for clinical use | ✅ Supported | Total TTFB P95 = 7 698 ms < 10 000 ms SLA |
| **O5** | Patient session closes within 30 s of physical device power-off | ✅ Supported | Session closes at T+22 s; badge updates at T+25 s |

---

## 🛠 Technology Stack

### Firmware (Device)
| Component | Technology |
|---|---|
| Microcontroller | ESP32 Dev Module |
| Framework | Arduino (C++) |
| Transport | WiFi + MQTT (PubSubClient) |
| SpO₂ / BPM Sensor | MAX30102 (SparkFun library, I2C address 0x57) |
| Temperature Sensor | MLX90614ESF (Adafruit library, I2C address 0x5A) |
| Serialisation | ArduinoJson |

### Bedside Backend
| Component | Technology |
|---|---|
| API Framework | FastAPI 0.115.0 + Uvicorn 0.30.6 |
| Time-series DB | InfluxDB 2.7.6 (Docker) on port 8087 |
| Relational DB | Supabase Postgres |
| MQTT Broker | Eclipse Mosquitto 2.0 (Docker) on port 1883 |
| MQTT Bridge | paho-mqtt (Python) |
| ML Inference | XGBoost ≥ 2.0, scikit-learn ≥ 1.4, joblib ≥ 1.3 |
| Async HTTP | aiohttp ≥ 3.9, httpx 0.27.2 |
| Notifications | Telegram Bot API + SMTP (smtplib) |
| Queue Persistence | SQLite (`sync_queue.db`) |

### Cloud Backend
| Component | Technology |
|---|---|
| API Framework | FastAPI 0.115.0 + Uvicorn 0.30.6 |
| Time-series DB | InfluxDB Cloud (Singapore region) |
| Relational DB | Supabase Postgres |
| Auth | Supabase Auth (JWT middleware) |
| AI / CDSS | Anthropic Claude API (`claude-haiku-4-5`) |
| Deployment | Railway |

### Frontend
| Component | Technology |
|---|---|
| Framework | Next.js 16.2.6 + React 19 |
| Charting | ECharts 6.x, Recharts 3.x |
| Animations | Framer Motion 12 |
| UI Components | Radix UI (Dialog, Label, Select, Separator, Slot) |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Bedside deployment | `localhost:3001` (npm dev) |
| Admin deployment | Vercel |

### ML Training
| Component | Technology |
|---|---|
| Notebook | Jupyter (`.ipynb`) |
| Algorithm | XGBoost (selected from 5-model evaluation) |
| Validation | RepeatedStratifiedKFold (5 × 10, 50 rounds) |
| Calibration | Isotonic Regression |
| Dataset | Kaggle `human_vital_signs_dataset_2024.csv` (200,020 rows) |

---

## 📋 Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Docker Desktop | Latest | InfluxDB + Mosquitto containers |
| Python | 3.11+ | Backend, MQTT bridge, measurement scripts |
| Node.js | 20+ | Both Next.js frontends |
| Arduino IDE | 2.x | ESP32 firmware flashing |
| Git | Any | Clone the repository |

**Cloud services required (free tiers available):**
- [Supabase](https://supabase.com) — Postgres + Auth
- [InfluxDB Cloud](https://cloud2.influxdata.com) — cloud time-series (Singapore region)
- [Railway](https://railway.app) — cloud backend hosting
- [Vercel](https://vercel.com) — admin frontend hosting
- [Anthropic API](https://console.anthropic.com) — Claude API key for AI summary + Clinical Copilot

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd MediSync
```

### 2. Bedside backend — Python virtual environment

```bash
cd backend/local
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/local/.env`:

```env
LOCAL_INFLUX_URL=http://localhost:8087
LOCAL_INFLUX_TOKEN=medisync-local-token
LOCAL_INFLUX_ORG=health-org
LOCAL_INFLUX_BUCKET=health_local

CLOUD_INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=your-org-name
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

NURSE_PASSWORD=your-shared-nurse-password
DEVICE_SECRET=esp32

TELEGRAM_BOT_TOKEN=your-bot-token        # optional
TELEGRAM_CHAT_ID=your-chat-id            # optional

ADMIN_EMAIL=admin@example.com            # optional
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sender@gmail.com
SMTP_PASSWORD=your-gmail-app-password    # optional
```

### 3. Cloud backend — Python virtual environment

```bash
cd backend/cloud
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/cloud/.env` (or set these in the Railway dashboard):

```env
CLOUD_INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com
CLOUD_INFLUX_TOKEN=your-cloud-token
CLOUD_INFLUX_ORG=your-org-name
CLOUD_INFLUX_BUCKET=health_cloud

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

ANTHROPIC_API_KEY=your-anthropic-api-key
```

### 4. Bedside frontend

```bash
cd frontend/bedside
npm install
```

Create `frontend/bedside/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 5. Admin frontend

```bash
cd frontend/admin
npm install
```

Create `frontend/admin/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://medisync-cloud-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 6. Root virtual environment (measurement scripts)

The measurement scripts in `measurements/` use the root-level `.venv`:

```bash
cd MediSync
python3 -m venv .venv
source .venv/bin/activate
pip install httpx requests sseclient-py
```

### 7. Supabase — run migrations in order

Execute the following files in the Supabase SQL editor in order:

```
supabase/migrations/20260511000000_initial_schema.sql
supabase/migrations/20260511000001_enable_rls.sql
supabase/migrations/20260528000000_sessions_duration.sql
supabase/migrations/20260529000000_sessions_realtime.sql
```

> The `ALTER PUBLICATION` line in the last migration may return "already a member" if applied via the Supabase dashboard — that error is safe to ignore.

### 8. ESP32 firmware

1. Open `firmware/main/main.ino` in Arduino IDE
2. Edit `firmware/main/config.h` — fill in your WiFi credentials and the bedside machine LAN IP:
   ```cpp
   #define WIFI_SSID     "your-wifi-ssid"
   #define WIFI_PASSWORD "your-wifi-password"
   #define MQTT_BROKER   "192.168.x.x"   // bedside machine LAN IP
   ```
3. Install the following libraries via **Tools → Manage Libraries**:
   - `PubSubClient` (Nick O'Leary)
   - `ArduinoJson`
   - `SparkFun MAX3010x Pulse and Proximity Sensor Library`
   - `Adafruit MLX90614 Library`
4. Select board: **ESP32 Dev Module** (Tools → Board → esp32)
5. Flash with `Ctrl+U` — monitor Serial output at 115200 baud:
   ```
   [wifi] Connected  IP=192.168.x.x
   [mqtt] Connecting to broker...ok
   [init] Ready — publishing to medisync/readings
   ```

To verify sensor wiring before flashing the main sketch, upload `firmware/i2c_scan/i2c_scan.ino` and confirm MAX30102 at `0x57` and MLX90614 at `0x5A` in the Serial Monitor.

---

## 🚀 Running the Project

### Option A — VS Code (Recommended)

Press **`Ctrl+Shift+B`** to run the default build task **`MediSync: Start All`**.

This automatically starts all four services in sequence:
1. `docker compose up -d` — launches InfluxDB (port 8087) and Mosquitto (port 1883)
2. `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` — starts the bedside FastAPI backend
3. `npm run dev` — starts the bedside Next.js frontend on port 3001
4. `python firmware/mqtt_bridge.py` — starts the MQTT bridge (subscribes to readings + LWT)

Each service opens in its own VS Code terminal panel so logs are visible per-service.

### Option B — Shell script (one-command)

```bash
chmod +x start-bedside.sh
./start-bedside.sh
```

The script kills any stale processes on ports 8000 and 3001, starts the FastAPI backend and Next.js frontend, waits for both to be ready, then opens `http://localhost:3001` in your browser automatically. Press `Ctrl+C` to stop both processes.

> Note: `start-bedside.sh` does not start Docker or the MQTT bridge. Run `docker compose up -d` and `python firmware/mqtt_bridge.py` separately.

### Option C — Manual (step by step)

**Step 1 — Start Docker services (InfluxDB + Mosquitto):**
```bash
docker compose up -d
```
InfluxDB UI: `http://localhost:8087` | MQTT broker: `localhost:1883`

**Step 2 — Start bedside backend:**
```bash
cd backend/local
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Swagger docs: `http://localhost:8000/docs` | Health check: `http://localhost:8000/health`

**Step 3 — Start bedside frontend:**
```bash
cd frontend/bedside
npm run dev
```
Open `http://localhost:3001`

**Step 4 — Start MQTT bridge:**
```bash
cd firmware
source ../.venv/bin/activate   # or use any Python env with paho-mqtt installed
python mqtt_bridge.py
```

**Step 5 — (Optional) Start admin frontend locally:**
```bash
cd frontend/admin
npm run dev
```
Open `http://localhost:3002` — log in with your Supabase admin credentials.

### Stopping all services

Use the VS Code task **`MediSync: Kill All`** (accessible via **Terminal → Run Task → MediSync: Kill All**) to stop all running processes:

```
pkill -f 'uvicorn main:app'
pkill -f 'mqtt_bridge.py'
pkill -f 'next dev'
pkill -f 'next-server'
```

---

## ⌨️ Development Shortcuts

All shortcuts are defined in [.vscode/tasks.json](.vscode/tasks.json).

### Primary Shortcuts

| Action | Shortcut / Command | What It Does |
|---|---|---|
| **Start All Services** | `Ctrl+Shift+B` | Default build task — runs `docker compose up -d`, starts FastAPI backend (port 8000), Next.js bedside frontend (port 3001), and MQTT bridge in sequence |
| **Kill All Services** | Terminal → Run Task → `MediSync: Kill All` | Kills uvicorn, mqtt_bridge.py, next dev, next-server, and next-router-worker processes |

### Measurement Tasks (Terminal → Run Task)

| Task Label | Command | Description |
|---|---|---|
| `MediSync: Start All + Measure H1` | Runs all services, then `latency_measure.py --samples 600` | Starts all services and immediately begins the H1 bedside latency measurement (600 samples). Requires an active patient session. |
| `H1: Measure Latency` | `.venv/bin/python3 measurements/latency_measure.py --samples 600` | Standalone H1 bedside end-to-end latency measurement — `bridge_ts` to SSE receipt |
| `O2: Auth Boundary Test` | `.venv/bin/python3 measurements/measure_o2_auth.py --device-secret esp32` | Tests all 6 authentication boundaries; writes results to `measurements/o2_auth_results.md` |
| `H3: Resilience Test` | `.venv/bin/python3 measurements/measure_h3_resilience.py --sse-samples 60` | SSE uptime + SQLite crash-recovery validation |
| `O1: Notification Latency Test` | `.venv/bin/python3 measurements/measure_o1_notifications.py --device-secret esp32 --samples 3 --force-resolve` | Alert notification latency and deduplication test |
| `O4: AI CDSS TTFB Test` | `.venv/bin/python3 measurements/measure_o4_cdss_ttfb.py --patient <uuid> --token <jwt> --samples 20 --range 24h` | AI Clinical Copilot streaming time-to-first-byte measurement (prompts for patient UUID and JWT) |
| `MediSync: Run All Measurements` | Runs O2 → H3 → O1 → O4 in sequence | Full empirical validation suite (O4 will prompt for patient UUID and JWT) |
| `MediSync: Start MQTT Bridge` | `.venv/bin/python3 firmware/mqtt_bridge.py` | Standalone MQTT bridge start (background task) |

### Re-running Measurements Manually

```bash
# H1 — Bedside latency (requires active patient session)
python measurements/latency_measure.py --samples 600

# H2 — Cloud-only latency
python measurements/latency_measure_cloud.py --patient <uuid> --token <sb-jwt> --samples 300

# H3 — Resilience
python measurements/measure_h3_resilience.py --sse-samples 60

# O1 — Notification latency
python measurements/measure_o1_notifications.py --device-secret esp32 --samples 3 --force-resolve

# O2 — Auth boundaries
python measurements/measure_o2_auth.py --device-secret esp32

# O4 — AI CDSS TTFB
python measurements/measure_o4_cdss_ttfb.py --patient <uuid> --token <sb-jwt> --samples 20
```

---

## 📂 Project Structure

```
MediSync/
├── firmware/
│   ├── main/
│   │   ├── main.ino          # WiFi auto-reconnect, MQTT LWT (keepalive=15 s), publishes every 1 s
│   │   ├── config.h          # WiFi SSID/password, MQTT broker IP, device credentials, LED pins
│   │   └── sensors.h         # sensorsBegin/Update, readSpO2/BPM/Temperature
│   ├── i2c_scan/             # Utility sketch — verify sensor I2C addresses before flashing
│   ├── serial_bridge.py      # Deprecated — USB serial bridge (ESP32 now uses WiFi + MQTT only)
│   └── mqtt_bridge.py        # MQTT bridge — forwards readings to FastAPI, handles LWT disconnect
│
├── backend/
│   ├── local/                # FastAPI — bedside machine (localhost:8000)
│   │   ├── main.py           # App entry point, active_patient_id state, heartbeat watchdog
│   │   ├── status.py         # Rule-based get_status() — NORMAL / WARNING / DANGER
│   │   ├── database.py       # Bedside InfluxDB async write client
│   │   ├── supabase_client.py # Patient + session ops; ghost-session prevention, duration tracking
│   │   ├── sync.py           # Async cloud sync worker with SQLite queue persistence
│   │   ├── notifications.py  # Telegram + SMTP email (fire-and-forget, asyncio.create_task)
│   │   ├── ml/
│   │   │   └── predict.py    # load_model() + run_inference() — XGBoost anomaly detection
│   │   ├── routers/
│   │   │   ├── patients.py   # POST /api/patients
│   │   │   ├── session.py    # POST /api/session/login|logout, GET /api/session/active
│   │   │   ├── readings.py   # POST /api/readings — ML inference, OOD override, alert write
│   │   │   ├── stream.py     # GET /api/stream (SSE)
│   │   │   └── device.py     # POST /api/device/disconnect
│   │   └── requirements.txt
│   │
│   └── cloud/                # FastAPI — Railway
│       ├── main.py           # App entry point, CORS
│       ├── status.py         # Same rule-based get_status()
│       ├── database.py       # InfluxDB Cloud + Supabase clients
│       ├── auth.py           # Supabase Auth JWT middleware (require_auth dependency)
│       ├── claude_service.py # Claude API — summary streaming, alert analysis, chat follow-up
│       ├── routers/
│       │   ├── patients.py   # GET /api/patients, GET /api/patients/:id
│       │   ├── stream.py     # GET /api/patients/:id/stream (SSE, polls InfluxDB Cloud every 2 s)
│       │   ├── history.py    # GET /api/patients/:id/history?from=&to=
│       │   ├── sessions.py   # GET /api/patients/:id/sessions
│       │   ├── alerts.py     # GET /api/alerts, PUT /api/alerts/resolve-all/:patient_id
│       │   ├── summary.py    # GET /api/patients/:id/summary (SSE, Claude streaming)
│       │   └── copilot.py    # POST /api/copilot/analyze + POST /api/copilot/chat (SSE)
│       └── requirements.txt
│
├── frontend/
│   ├── bedside/              # Next.js 16 — localhost:3001
│   │   ├── app/
│   │   │   ├── page.tsx      # Index — New Patient / Existing Patient
│   │   │   ├── register/     # Patient registration form
│   │   │   ├── login/        # IC number + nurse password
│   │   │   └── dashboard/    # StatusCard + GaugeCards + LiveChart
│   │   ├── components/
│   │   │   ├── StatusCard/   # Live rule-based status (SSE-driven)
│   │   │   ├── GaugeCard/    # SVG arc gauge — SpO₂, BPM, Temp
│   │   │   └── LiveChart/    # Recharts scrolling time-series (last 60 readings)
│   │   └── proxy.ts          # Redirect /dashboard → / if no active patient
│   │
│   └── admin/                # Next.js 16 — Vercel (localhost:3002 in dev)
│       ├── app/
│       │   ├── page.tsx      # Supabase Auth login
│       │   ├── dashboard/    # Summary cards + patient table
│       │   └── patient/[id]/ # Live stream, history chart, AI summary, alert log, Clinical Copilot
│       ├── components/
│       │   ├── StatusCard/   # Cloud SSE-driven status (isStale detection at 15 s)
│       │   ├── SummaryCard/  # Dashboard metric cards
│       │   ├── PatientTable/ # Searchable, filterable patient table
│       │   ├── LiveChart/    # Real-time ECharts chart
│       │   ├── HistoryChart/ # Date-range history with alert markArea overlay
│       │   ├── AlertBadge/   # Unresolved alert count badge
│       │   ├── AISummaryPanel/ # Claude API streaming health summary
│       │   └── ClinicalCopilot/ # Sliding drawer CDSS chatbox (streaming SSE)
│       └── proxy.ts          # Redirect to / if no sb-token cookie
│
├── ml/
│   ├── health_risk_ml.ipynb           # 18-section training pipeline notebook
│   ├── health_risk_model.joblib       # Trained XGBoost model
│   ├── health_risk_scaler.joblib      # StandardScaler (fit on train set only)
│   ├── health_risk_label_encoder.joblib # LabelEncoder
│   └── model_metadata.json            # Audit trail + performance numbers
│
├── supabase/
│   └── migrations/                    # Run in Supabase SQL editor in order
│       ├── 20260511000000_initial_schema.sql
│       ├── 20260511000001_enable_rls.sql
│       ├── 20260528000000_sessions_duration.sql
│       └── 20260529000000_sessions_realtime.sql
│
├── measurements/                      # Empirical validation scripts and results
│   ├── latency_measure.py             # H1: bedside latency measurement
│   ├── latency_results.md             # H1 results: 600 samples, P95 = 1 172.5 ms ✅
│   ├── latency_measure_cloud.py       # H2: cloud-only latency measurement
│   ├── latency_results_cloud.md       # H2 results: 300 samples, P95 = 1 917.7 ms ✅
│   ├── measure_h3_resilience.py       # H3: SSE uptime + SQLite crash-recovery
│   ├── h3_resilience_results.md       # H3 results: 100% SSE uptime (60/60) ✅
│   ├── measure_o1_notifications.py    # O1: notification latency + deduplication
│   ├── o1_notification_results.md     # O1 results: 100–180 ms API response ✅
│   ├── measure_o2_auth.py             # O2: 6 auth boundary tests
│   ├── o2_auth_results.md             # O2 results: all pass, rejections < 2 ms ✅
│   ├── measure_o4_cdss_ttfb.py        # O4: AI CDSS streaming TTFB
│   └── o4_cdss_results.md             # O4 results: P95 = 7 698 ms < 10 000 ms SLA ✅
│
├── .vscode/
│   └── tasks.json                     # VS Code build/test tasks
├── docker-compose.yml                 # InfluxDB 2.7.6 (port 8087) + Mosquitto 2.0 (port 1883)
├── start-bedside.sh                   # One-command bedside startup script
└── README.md
```

---

## 🔧 Troubleshooting

### Docker — InfluxDB or Mosquitto not starting
```bash
docker compose down && docker compose up -d
docker compose logs influxdb
docker compose logs mosquitto
```
> InfluxDB uses host port **8087** (not 8086 — that port is reserved by another service on the bedside machine).

### ESP32 — no readings arriving in FastAPI
1. Check Serial Monitor (115200 baud) for `[wifi] Connected` and `[mqtt] ok`
2. Confirm `MQTT_BROKER` in `config.h` is the correct LAN IP of the bedside machine
3. Verify Mosquitto is running: `docker compose ps`
4. Verify `mqtt_bridge.py` is running and shows `Subscribed to medisync/readings`

### ESP32 — random MQTT disconnects
Confirm `firmware/main/main.ino` sets these three flags in `connectWiFi()`:
- `WiFi.setSleep(false)` — disables modem sleep (primary cause of random drops)
- `WiFi.setAutoReconnect(true)` — hardware-level reconnect on AP loss
- `WiFi.persistent(false)` — prevents flash wear on every reconnect

### Bedside backend — ML model not loading
If `backend/local/ml/*.joblib` files are missing, regenerate them by running all cells in `ml/health_risk_ml.ipynb`. The backend starts normally without them — predictions default to `"normal"` with `confidence: 0.0`.

### Cloud backend — AI features not working
Confirm `ANTHROPIC_API_KEY` is set in the Railway dashboard environment variables. The key is read automatically by the Anthropic SDK; no `os.getenv` is needed in the code.

### MQTT bridge — stale LWT fires on startup
This is expected behaviour. The MQTT broker replays retained messages to new subscribers on connection. The bridge guards against this: if `msg.retain == 1`, the offline LWT is stale and is silently skipped. Only a live non-retained offline message triggers `POST /api/device/disconnect`.

### Admin frontend — SSE stream shows stale data
The admin `StatusCard` displays an offline indicator when the reading timestamp (`ts`) is more than 15 seconds behind wall-clock time. This is by design — it signals that the ESP32 has gone offline or the cloud SSE chain is interrupted.

### Cloud backend — 401 on all endpoints
Obtain a fresh Supabase JWT:
```bash
curl -X POST 'https://<your-project>.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "yourpassword"}'
```
Use the returned `access_token` as `Authorization: Bearer <token>`. For SSE endpoints, pass it as `?token=<token>`.

### Telegram notifications not firing
1. Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in `backend/local/.env`
2. Ensure you have started a chat with your bot (otherwise `getUpdates` returns no `chat.id`)
3. Both vars must be non-empty — blank vars silently skip Telegram without an error

### Gmail SMTP App Password
Gmail requires an **App Password**, not your account password. Enable 2-Step Verification on your Google account, then generate one at `https://myaccount.google.com/apppasswords`. Use the 16-character password as `SMTP_PASSWORD`.

---

## 📝 Notes

- **Port assignments:** Bedside InfluxDB UI → `http://localhost:8087` · Bedside FastAPI → `http://localhost:8000` · Bedside Next.js → `http://localhost:3001` · Admin Next.js (dev) → `http://localhost:3002`
- **In-memory session state:** `app.state.active_patient_id` is cleared on FastAPI restart — the nurse must log in again. Only one patient can be monitored per bedside machine at a time.
- **ML artefacts:** `ml/*.joblib` files are present in the repository. If you need to retrain, re-run all cells in `ml/health_risk_ml.ipynb`.
- **`status.py` duplication:** `backend/local/status.py` and `backend/cloud/status.py` are identical files — keep them in sync manually.
- **Rate limiter removed:** `POST /api/readings` has no rate limiter. It is secured by `X-Device-Secret` header. The limiter was removed because it caused false 429s during MQTT reconnect bursts from a trusted device.
- **Deprecated:** `firmware/serial_bridge.py` (USB serial bridge) is no longer used. The ESP32 runs WiFi + MQTT exclusively. The file is kept for reference.
- **Cloud sync worker:** Uses `InfluxDBClientAsync` (aiohttp) with a persistent connection pool and 60 s timeout — avoids per-write TLS handshake overhead that caused intermittent timeouts with the old synchronous client.
- **Session `closed_reason` vocabulary:** `"manual_logout"` · `"device_disconnect"` · `"auto_timeout"` — use these exact strings everywhere.
- **Alert audit trail:** `PUT /api/alerts/resolve-all/{patient_id}` only sets `resolved_at` — rows are never deleted. The full alert history is a medical audit trail.
- **InfluxDB Cloud free tier:** 5 MB / 5-minute write limit, 30-day data retention. Sufficient for prototype operation.

---

## 🚀 Deployment

| Service | Platform | URL |
|---|---|---|
| Cloud backend | Railway | `https://medisync-cloud-api-production.up.railway.app` |
| Admin frontend | Vercel | `https://medi-sync-eta.vercel.app` |
| Bedside InfluxDB | Docker (local) | `http://localhost:8087` |
| MQTT broker | Docker (local) | `localhost:1883` |

**Railway configuration:**
- Root directory: `/backend/cloud`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all cloud environment variables in the Railway dashboard

**Vercel configuration:**
- Root directory: `/frontend/admin`
- Framework: Next.js (declared in `vercel.json`)
- Set `NEXT_PUBLIC_API_URL` and Supabase keys in Vercel environment settings

---

## 👨‍🎓 Author & Academic Information

**Student Name**
LIAN JIA JUN

**Student ID**
243UT246W5

**Project Title**
REAL-TIME HEALTH MONITORING VIA WEARABLE IOT WITH CLOUD ANALYTICS

**Project ID**
T88J182

**Supervisor**
Dr. Subarmaniam A/L Kannan

**Institution**
Faculty of Information Science and Technology (FIST)
Multimedia University (MMU), Malaysia

---

## 🏆 Acknowledgement

This project was developed as part of the Final Year Project (FYP) requirements for the Bachelor Degree programme at Multimedia University.

The system was independently designed, implemented, tested, evaluated, deployed, and documented by the author throughout the project lifecycle, covering wearable IoT integration, cloud analytics, real-time monitoring, notification systems, system resilience, and healthcare data visualization.

---

## 📜 Copyright & Intellectual Property

© 2026 Lian Jia Jun, Multimedia University. All Rights Reserved.

This project and its accompanying documentation, source code, system architecture, research findings, implementation materials, and technical assets are protected under applicable copyright laws.

No part of this repository may be reproduced, distributed, modified, republished, or used for commercial purposes without prior written permission from the author.

---

<div align="center">

## ❤️ Built with Dedication, Persistence, and Countless Late Nights

REAL-TIME HEALTH MONITORING VIA WEARABLE IOT WITH CLOUD ANALYTICS

Bachelor Final Year Project (FYP)

Faculty of Information Science and Technology (FIST)

Multimedia University (MMU)

2026

</div>
