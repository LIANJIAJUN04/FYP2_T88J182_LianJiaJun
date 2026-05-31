# MediSync — Wearable Health Monitor

A real-time IoT patient health monitoring system built for clinical bedside and remote admin use.

An ESP32 with SpO₂, BPM, and temperature sensors transmits readings via WiFi using the MQTT protocol to a bedside Mosquitto broker. Readings are written on the bedside machine for low-latency bedside display, and synced asynchronously to the cloud for remote admin monitoring.

---

## Two Display Modes

| | Bedside | Admin (Cloud) |
|---|---|---|
| Connection | WiFi + MQTT to bedside machine | Internet, anywhere |
| Latency | Mean 620 ms · P95 1 173 ms (measured) | Mean 1 040 ms · P95 1 918 ms (measured) |
| Auth | Shared nurse password | Supabase Auth (email + password) |
| Frontend | Next.js on localhost | Next.js on Vercel |
| Reads from | Bedside InfluxDB | InfluxDB Cloud |
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
│   ├── main/               # Main sketch — WiFi + MQTT + LWT (fill config.h credentials, then flash)
│   │   ├── main.ino        # WiFi auto-reconnect, MQTT LWT keepalive=15 s, publishes every 1 s
│   │   └── config.h        # WiFi SSID/password, MQTT broker IP, device credentials, LED pins
│   ├── i2c_scan/           # Utility sketch — verify sensor wiring
│   ├── serial_bridge.py    # Deprecated — USB Serial bridge; ESP32 now runs WiFi + MQTT exclusively
│   └── mqtt_bridge.py      # WiFi transport bridge — LWT subscriber + readings forwarder
├── backend/
│   ├── local/              # FastAPI — bedside machine (localhost:8000)
│   │   ├── main.py         # App entry point, state, startup + heartbeat watchdog
│   │   ├── status.py       # Rule-based get_status()
│   │   ├── database.py     # Bedside InfluxDB write client
│   │   ├── supabase_client.py  # Patient + session ops; ghost-session prevention + duration tracking
│   │   ├── sync.py         # Async queue + cloud sync worker (SQLite-backed)
│   │   ├── notifications.py  # Telegram + SMTP email alert sender (fire-and-forget)
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
│       ├── 20260511000001_enable_rls.sql        # RLS policies — authenticated read access
│       ├── 20260528000000_sessions_duration.sql # duration_seconds + closed_reason columns
│       └── 20260529000000_sessions_realtime.sql # REPLICA IDENTITY FULL + realtime publication
├── measurements/                    # Empirical validation scripts and results
│   ├── latency_measure.py           # H1: bedside latency — bridge_ts → SSE receipt
│   ├── latency_results.md           # H1 results: 600 samples, P95 = 1 172.5 ms ✅
│   ├── latency_measure_cloud.py     # H2: cloud-only latency measurement
│   ├── latency_results_cloud.md     # H2 results: 300 samples, P95 = 1 917.7 ms ✅
│   ├── measure_h3_resilience.py     # H3: SSE uptime + SQLite crash-recovery
│   ├── h3_resilience_results.md     # H3 results: 100% SSE uptime (60/60)
│   ├── measure_o1_notifications.py  # O1: notification latency + dedup
│   ├── o1_notification_results.md   # O1 results: 100–180 ms API response
│   ├── measure_o2_auth.py           # O2: all 6 auth boundary tests
│   ├── o2_auth_results.md           # O2 results: all pass, local rejections < 2 ms
│   ├── measure_o4_cdss_ttfb.py      # O4: AI CDSS streaming TTFB
│   └── o4_cdss_results.md           # O4 results: P95 = 7 698 ms < 10 000 ms SLA
├── docker-compose.yml      # Bedside InfluxDB + Mosquitto
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
6. Click **"All clear"** in the Alert Log header at any time to bulk-resolve all open alerts. The log clears instantly (optimistic update), then re-syncs from the server so resolved rows reappear with timestamps. Audit trail preserved — rows are soft-resolved, never deleted.

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

**Bulk alert resolution:** The **"All clear"** button in the Alert Log header is always interactive — it never becomes a static label. Clicking it calls `PUT /api/alerts/resolve-all/{patient_id}`, which stamps `resolved_at = now()` on every open alert for the patient in a single query. No rows are deleted — the full alert history is preserved as a medical audit trail. The frontend optimistically empties the log immediately, then re-fetches to restore resolved rows with accurate timestamps.

API endpoints:
- `POST /api/copilot/analyze` — buffered JSON (validation required for structured rendering)
- `POST /api/copilot/chat` — SSE stream with `X-Accel-Buffering: no` for Railway nginx
- `PUT /api/alerts/resolve-all/{patient_id}` — bulk soft-resolve; returns `{ status, resolved_count }`

---

## Admin Dashboard Metrics

The four summary cards on the admin dashboard (`/dashboard`) count **distinct patients**, not raw alert rows.

| Card | Metric | Mode |
|---|---|---|
| Total Patients | All registered patients | Always global |
| Active Sessions | Patients with an open session | Always global |
| Patients Requiring Attention | Distinct patients with ≥1 unresolved alert — filtered to match the current table view | Context-aware |
| Critical Patients | Distinct **active-session** patients with ≥1 unresolved alert | Always live |

**Context-aware mode (Card 3):** The Status filter in the patient table is a controlled prop lifted to `DashboardPage`. Switching between All / Active / Inactive recomputes `contextPatients` and immediately re-derives Card 3's value. Card 4 is always live regardless of the filter.

**`AlertBadge` in the patient table** shows `unresolvedAlerts` count (not total all-time). When zero unresolved alerts exist it renders "None" — keeping the table badge consistent with the cards above.

---

## ML Anomaly Detection

The bedside backend runs an XGBoost classifier on every reading to detect subtle physiological patterns that fall within technically normal thresholds — the kind rule-based alerts miss.

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

## Alert Notifications (Telegram + Email)

When the ML model detects an anomaly or a reading crosses a danger threshold, the bedside backend sends an instant notification to the admin via **Telegram** and/or **email** — no page refresh required.

**What triggers a notification:**
- Rule-based **DANGER** — one notification per breached metric (SpO₂, BPM, or Temperature)
- **ML anomaly** (prediction = anomaly, status = normal) — one notification for the most-deviant metric

**Built-in cooldown:** A notification fires only once per alert event. Subsequent readings in the same danger window are suppressed — the alert row already exists in Supabase so `upsert_alert` skips the insert and no notification is sent. The next notification fires only after the patient recovers (alerts auto-resolved) and a new event begins.

**Setup — Telegram:**
1. Message `@BotFather` → `/newbot` → copy the token
2. Start a chat with your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` — copy the `chat.id` value

**Setup — Email (Gmail):**
1. Enable 2-Step Verification on your Google account
2. Go to `https://myaccount.google.com/apppasswords` → generate an App Password for "Mail"
3. Use the 16-char App Password as `SMTP_PASSWORD`

**Configure `backend/local/.env`:**
```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

ADMIN_EMAIL=admin@example.com
SMTP_USER=sender@gmail.com
SMTP_PASSWORD=your-app-password
```

Either channel can be left blank to disable it independently — missing vars are silently skipped.

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
  "ts": "2025-05-06T10:00:01Z",
  "bridge_ts": "2025-05-06T10:00:00.812Z"
}
```

`prediction` — ML result: `"normal"` or `"anomaly"`.  
`confidence` — probability of the predicted class (0–1). `0.0` when model is not loaded or SpO₂ is unavailable.  
`bridge_ts` — UTC ISO timestamp set by `mqtt_bridge.py` at MQTT receive time. Used by `latency_measure.py` to compute end-to-end latency.

---

## Development

### Prerequisites
- Docker Desktop
- Python 3.11+
- Node.js 20+

### Bedside Setup

**One-command start via VS Code (recommended):**

Press **Ctrl+Shift+B** → selects `MediSync: Start All + Measure H1` — starts InfluxDB, FastAPI, frontend, MQTT bridge in sequence, then launches the H1 latency measurement automatically. Log in as a patient in the browser and measurements begin immediately.

**One-command start via terminal:**

```bash
./start-bedside.sh
```

Opens `http://localhost:3001` automatically. Kills stale processes on 8000/3001, starts backend, waits for readiness, then starts frontend. `Ctrl+C` stops both.

**Manual start:**

```bash
# 1. Start bedside InfluxDB + Mosquitto MQTT broker
docker compose up -d

# 2. Start bedside backend
cd backend/local
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000

# 3. Start bedside frontend
cd frontend/bedside
npm run dev
```

Open `http://localhost:3001` (port 3000 may be occupied on some machines).

### ESP32 — WiFi MQTT (primary transport)

The firmware uses WiFi + MQTT with a Last Will and Testament (LWT) so the broker automatically broadcasts an "offline" event if the device loses power — closing the session within ~22 s.

**1. Configure** `firmware/main/config.h` — fill in your real values:

```cpp
#define WIFI_SSID      "your-wifi-ssid"
#define WIFI_PASSWORD  "your-wifi-password"
#define MQTT_BROKER    "192.168.x.x"   // bedside machine LAN IP (same WiFi network)
```

**2. Install libraries** in Arduino IDE → Library Manager:
- `PubSubClient` (Nick O'Leary)
- `ArduinoJson`
- `SparkFun MAX3010x Pulse and Proximity Sensor Library`
- `Adafruit MLX90614 Library`

**3. Flash** `firmware/main/main.ino` — board: **ESP32 Dev Module**, speed: 115200 baud. Watch the Serial Monitor for:
```
[wifi] Connected  IP=192.168.x.x
[mqtt] Connecting to broker...ok
[init] Ready — publishing to medisync/readings
```

**4. Start the MQTT bridge** (after `docker compose up -d` has started Mosquitto):

```bash
cd firmware
pip install paho-mqtt requests
python mqtt_bridge.py   # subscribes to medisync/readings + medisync/status (LWT)
```

The bridge subscribes to `medisync/status` — on abrupt power loss the broker broadcasts `{"status":"offline"}` (LWT) and the bridge immediately calls `POST /api/device/disconnect` to close the session.

To verify sensor wiring before flashing, use `firmware/i2c_scan/i2c_scan.ino` — Serial Monitor should report MAX30102 at `0x57` and MLX90614 at `0x5A`.

### Admin Frontend

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

### Cloud Backend

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

> **Note:** Bedside InfluxDB runs on port **8087** (not 8086). UI at `http://localhost:8087`, token: `medisync-local-token`.

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
| Bedside InfluxDB | Docker | `docker compose up -d` |

---

## Implementation Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Bedside InfluxDB setup | ✅ Done |
| 2 | InfluxDB Cloud setup | ✅ Done |
| 3 | Supabase schema + auth | ✅ Done |
| 4 | Local FastAPI backend | ✅ Done |
| 5 | Cloud FastAPI backend | ✅ Done |
| 6 | Bedside frontend | ✅ Done |
| 7 | Admin frontend | ✅ Done |
| 8 | ESP32 firmware — WiFi + MQTT | ✅ Done — end-to-end verified (ESP32 → Mosquitto → bridge → FastAPI → InfluxDB) |
| 8.5 | Claude API CDSS — AI Summary + Clinical Copilot | ✅ Done |
| 9 | ML anomaly detection | ✅ Done |
| 10 | Polish & hardening | ✅ Done |
| 11 | Session lifecycle management — automated termination | ✅ Done |
| 12 | Admin live session badge — auto-refresh on device disconnect | ✅ Done |
| 13 | Alert notifications — Telegram + email on anomaly/danger detection | ✅ Done |

---

## Hypotheses & Objectives

Three hypotheses and five objectives were formally evaluated and empirically validated for the FYP.

| | Statement | Verdict | Key metric |
|---|---|---|---|
| **H1** | Bedside path achieves real-time performance (SLA: P95 < 2 000 ms) | ✅ Supported | P95 = 1 172.5 ms — 600 samples, 2026-05-30 |
| **H2** | Hybrid edge–cloud achieves lower latency than cloud-only path | ✅ Supported | 1.68× lower mean (620 ms vs 1 040 ms), 1.64× lower P95 |
| **H3** | Bedside monitoring survives cloud outages and backend restarts | ✅ Supported | 100% SSE uptime (60/60); SQLite crash-recovery proven |
| **O1** | Alert notifications delivered within seconds, non-blocking, deduplicated | ✅ Supported | API response 100–180 ms; `asyncio.create_task` fire-and-forget confirmed |
| **O2** | Independent authentication enforced at every access boundary | ✅ Supported | All 6 boundary tests pass; local rejections < 2 ms |
| **O3** | Full pipeline implemented exclusively on open-source components | ✅ Supported | 13 components — MIT / Apache 2.0 / EPL; zero proprietary dependency |
| **O4** | AI CDSS streaming TTFB within threshold for clinical use | ✅ Supported | Total TTFB P95 = 7 698 ms < 10 000 ms SLA — 20 samples |
| **O5** | Patient session closes within 30 s of physical device power-off | ✅ Supported | Session closes at T+22 s via MQTT LWT; badge updates at T+25 s |

### H1 — Real-Time Bedside Latency
Measured end-to-end from `bridge_ts` (MQTT receive) to SSE client receipt over 600 readings. Mean = 619.9 ms, P95 = 1 172.5 ms — passes the 2 000 ms SLA with 41% margin. Full results in `measurements/latency_results.md`. Re-measure: `python measurements/latency_measure.py --samples 600` (active patient session required).

### H2 — Hybrid vs Cloud-Only Latency
Cloud-only path (Local InfluxDB → async sync → InfluxDB Cloud → Railway → SSE) measured over 300 readings: Mean = 1 040.0 ms, P95 = 1 917.7 ms. Hybrid bedside is 1.68× lower mean and 1.64× lower P95. Full results in `measurements/latency_results_cloud.md`. Re-measure: `python measurements/latency_measure_cloud.py --patient <uuid> --token <jwt> --samples 300`.

### H3 — Fault Tolerance and Offline Resilience
The bedside data path has zero cloud dependency. During development, Railway and InfluxDB Cloud were temporarily unreachable while bedside monitoring continued uninterrupted. Unsynced readings accumulated in the SQLite `sync_queue.db` queue and flushed automatically on cloud recovery. Re-measure: `python measurements/measure_h3_resilience.py --sse-samples 60`.

### O1 — Alert Notifications
`asyncio.create_task(notify_alert(...))` is fire-and-forget — the ESP32 ACK returns before Telegram/email I/O begins. `upsert_alert()` returns `False` for readings in an existing unresolved alert window, suppressing duplicates. Re-measure: `python measurements/measure_o1_notifications.py --device-secret esp32 --samples 3 --force-resolve`.

### O2 — Multi-Layer Authentication
Three independent boundaries: ESP32 `X-Device-Secret` header (local FastAPI), IC number + shared nurse password (bedside session), Supabase Auth JWT (all cloud endpoints). Re-measure: `python measurements/measure_o2_auth.py --device-secret esp32`.

### O3 — Open-Source Pipeline
Every component — ESP32/Arduino, Eclipse Mosquitto, InfluxDB, FastAPI, Next.js, XGBoost, paho-mqtt, Docker — is released under a permissive or copyleft open-source licence. The bedside data path operates with no cloud service or proprietary SDK at any stage.

### O4 — AI CDSS Streaming Performance
The `meta` SSE event (period label + reading count) fires before the first Claude token. Claude Haiku delivers the first token within 598–1 158 ms of receiving the pre-computed context (19/20 samples). Re-measure: `python measurements/measure_o4_cdss_ttfb.py --patient <uuid> --token <jwt> --samples 20`.

### O5 — Session Lifecycle Integrity
Three-layer detection: (1) MQTT LWT fires within ~22 s of power loss → `POST /api/device/disconnect` closes session immediately; (2) serial idle timeout (30 s, deprecated USB path); (3) FastAPI heartbeat watchdog (5 min fallback). Ghost sessions are prevented by `open_session()` calling `close_active_session()` before every new session insert.

---

## Notes

- ML artefacts (`ml/*.joblib`) are gitignored — retrain on the bedside machine after cloning by re-running `ml/health_risk_ml.ipynb`
- `app.state.active_patient_id` is in-memory — restarting bedside FastAPI requires the nurse to log in again
- `status.py` is duplicated in bedside and cloud backends — keep them in sync
- **H1 latency validated** — 600 readings measured 2026-05-30: Mean=619.9ms, P95=1172.5ms. SLA (P95 < 2000ms) ✅ PASS. Full results in `measurements/latency_results.md`. Re-measure any time with `python measurements/latency_measure.py --samples 600`.
- **H2 latency validated** — 300 readings measured 2026-05-30: Cloud-only Mean=1040.0ms, P95=1917.7ms. Hybrid bedside is **1.68× lower mean** and **1.64× lower P95** than cloud-only path. Full results in `measurements/latency_results_cloud.md`. Re-measure with `python measurements/latency_measure_cloud.py --patient <uuid> --token <sb-token> --samples 300`.
- **Cloud sync** uses `InfluxDBClientAsync` (aiohttp) with a persistent connection pool and 60s timeout — eliminates per-write TLS handshake overhead that caused intermittent timeouts with the old synchronous client.
- **ESP32 WiFi stability** — `connectWiFi()` sets `WiFi.setSleep(false)` (disables modem sleep, the primary cause of random MQTT disconnects), `WiFi.setAutoReconnect(true)` (hardware-level reconnect), and `WiFi.persistent(false)` (no flash wear on every reconnect).
- `POST /api/readings` has no rate limiter — removed because the endpoint is already secured by `X-Device-Secret` and rate limiting caused false 429s during MQTT reconnect bursts.
- ESP32 firmware (WiFi + MQTT) is **fully verified end-to-end** — `main.ino` connects to WiFi, publishes to Mosquitto every 1 s, readings flow through `mqtt_bridge.py` → FastAPI → bedside InfluxDB. ESP32 runs on a USB power bank (no computer needed). LWT fires within ~22 s of abrupt power loss. Run `docker compose up -d` and `python firmware/mqtt_bridge.py` to start the bedside pipeline.
- `mqtt_bridge.py` guards against retained LWT false-positives on startup: `msg.retain == 1` means the broker is replaying a stale offline message — it is skipped. Only a live (non-retained) offline LWT triggers `POST /api/device/disconnect`.
- `serial_bridge.py` (USB serial) is deprecated — ESP32 runs WiFi + MQTT exclusively; the file is kept for reference only.
- Session `closed_reason` values: `"manual_logout"` (nurse clicked logout) | `"device_disconnect"` (bridge detected hardware loss) | `"auto_timeout"` (5-min watchdog fallback)
- Supabase migrations must be run in the SQL editor in order: `initial_schema` → `enable_rls` → `sessions_duration` → `sessions_realtime`
- The `sessions_realtime` migration (`20260529000000_sessions_realtime.sql`) enables the Supabase Realtime subscription on the admin frontend so session rows update live when a device disconnects. The `ALTER PUBLICATION` line may error "already a member" if applied via the dashboard — safe to ignore; the `ALTER TABLE sessions REPLICA IDENTITY FULL` line is what matters.
- The admin patient detail page auto-detects device offline via stale SSE data (`ts` frozen >15 s) and switches to 5 s session polling, flipping the "Session Active" badge to "No Active Session" within ~25 s of power-off — no page refresh required.
- InfluxDB Cloud free tier: 5 MB/5 min write limit, 30-day retention
- `ANTHROPIC_API_KEY` must be set in Railway for AI summary and Clinical Copilot — not needed on the bedside machine
- Telegram + email notifications fire only on the **first** reading of a new alert event — `upsert_alert` returns `False` for subsequent readings in the same event window, suppressing duplicates. The next notification fires only after the patient recovers and the alert is resolved.
- Notification env vars are all optional — blank vars silently skip that channel; no exception is raised
- Gmail SMTP requires an **App Password** (not your account password) — generate one at `https://myaccount.google.com/apppasswords` with 2-Step Verification enabled
