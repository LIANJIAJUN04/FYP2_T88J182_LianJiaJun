# Hypothesis Evaluation Report
## MediSync — Real-Time Wearable IoT Health Monitoring System

---

## Overview

This report evaluates three research hypotheses against the implemented MediSync system. MediSync is a real-time patient health monitoring system that uses an ESP32 microcontroller with SpO₂ (MAX30102), heart rate (MAX30102), and infrared temperature (MLX90614ESF) sensors. Readings are transmitted over USB Serial to a bedside machine, processed by a local FastAPI backend, stored in a local InfluxDB instance, and asynchronously synced to InfluxDB Cloud for remote admin monitoring.

The system operates across two distinct modes:

| Mode | Path | Latency |
|---|---|---|
| Bedside (local) | ESP32 → USB → serial bridge → FastAPI → InfluxDB → SSE → Next.js | ~100–300 ms |
| Admin (cloud) | Local InfluxDB → async sync → InfluxDB Cloud → Railway FastAPI → SSE → Vercel Next.js | 1–3 s |

---

## H1: Real-Time Performance

> **The integrated wearable IoT system achieves real-time performance as defined by end-to-end latency within an acceptable threshold for non-critical health monitoring applications.**

### System Design Evidence

The bedside data path was designed to minimise latency at every stage:

1. **Sensor sampling** — The ESP32 main loop runs every 1 second, serialising SpO₂, BPM, and temperature readings as newline-delimited JSON over USB Serial at 115200 baud.
2. **Serial bridge** — `serial_bridge.py` reads each JSON line and immediately POSTs it to the local FastAPI endpoint (`localhost:8000/api/readings`) with no buffering delay.
3. **Local backend** — `POST /api/readings` runs synchronous rule-based status classification (`status.py`), writes to local InfluxDB, caches the reading in `app.state.last_reading`, and enqueues a cloud sync task — all within a single async request handler.
4. **SSE stream** — `GET /api/stream` pushes `app.state.last_reading` to the browser every 1 second via Server-Sent Events, avoiding repeated database queries.
5. **Frontend** — The bedside Next.js dashboard (`localhost:3001`) consumes the SSE stream and updates `StatusCard`, `GaugeCard`, and `LiveChart` on each event.

The theoretical end-to-end latency on the bedside path is dominated by the 1-second sensor sampling interval plus serial transmission overhead, putting the practical update cycle at approximately **1–2 seconds** from sensor measurement to dashboard update. USB Serial transmission at 115200 baud adds negligible overhead for a short JSON payload (~60 bytes).

For the cloud admin path, asynchronous cloud sync via `sync.py` introduces an additional 1–3 seconds of network round-trip to Railway (FastAPI) and InfluxDB Cloud (Singapore region), giving a total observable latency of **2–5 seconds** from measurement to admin dashboard update.

### Evaluation

For non-critical health monitoring applications — defined in the literature as systems where delayed readings by several seconds do not preclude clinical intervention (as opposed to ICU or intraoperative monitoring) — a 1–2 second bedside update cycle and 2–5 second admin update cycle fall within the generally accepted threshold of **< 10 seconds** for continuous vital signs monitoring in ward settings.

### Limitations

- End-to-end latency was **not formally measured** with instrumentation code. No timestamps were recorded at the ESP32 transmission point and the browser render point to produce a measured distribution.
- The "acceptable threshold" is referenced qualitatively from system design intent rather than from a benchmarked comparison against a defined SLA.
- Network jitter on the cloud path (Railway → InfluxDB Cloud) was not characterised.

### Verdict

**Partially supported.** The architecture and observed behaviour are consistent with real-time performance for non-critical health monitoring. Formal empirical validation (measured latency distribution, explicit SLA definition) was not completed within the project scope.

---

## H2: Hybrid Edge–Cloud vs Cloud-Only Architecture

> **A hybrid edge–cloud processing architecture achieves lower end-to-end latency and reduced bandwidth consumption compared to a cloud-only processing configuration.**

### System Design Evidence

MediSync implements a hybrid edge–cloud architecture where:

- **Edge processing** — Rule-based status classification (`get_status()`) runs locally on the bedside machine for every reading. The result is stored in local InfluxDB and surfaced to the bedside dashboard without any cloud dependency.
- **Selective cloud sync** — Only the computed reading payload (SpO₂, BPM, temperature, status, prediction, alert — ~120 bytes per record) is forwarded to InfluxDB Cloud via the async `cloud_sync_worker`, rather than raw sensor data or full waveforms.
- **Decoupled paths** — Bedside display never waits on cloud availability. If cloud sync fails, the worker retries with a 5-second backoff while bedside monitoring continues uninterrupted.

In a theoretical **cloud-only** configuration, the ESP32 would need to transmit each reading directly to a remote API over WiFi, incurring:
- WiFi connection overhead and potential packet loss
- Full round-trip latency to a cloud endpoint (minimum 50–200 ms for Singapore-region endpoint, excluding processing)
- Higher bandwidth usage if raw sensor data or waveforms were streamed continuously

The hybrid design reduces cloud bandwidth by processing status classification locally and only uploading the minimal derived payload. It also eliminates the cloud path entirely for bedside display, which is the primary latency-sensitive use case.

### Evaluation

The architectural rationale for latency and bandwidth advantages is sound:

| Metric | Hybrid (implemented) | Cloud-only (theoretical) |
|---|---|---|
| Bedside display latency | ~1–2 s (local path) | ~2–5 s minimum (cloud round-trip) |
| Cloud upload payload | ~120 bytes/reading (derived fields) | Potentially higher if raw data streamed |
| Bedside availability during cloud outage | Unaffected | Dashboard unavailable |

### Limitations

- A **cloud-only baseline was never implemented or benchmarked**. Without a working cloud-only configuration, the latency and bandwidth comparisons above are theoretical estimates rather than measured results.
- No bandwidth measurement tooling was added to either path.
- The bandwidth advantage depends on the cloud-only system also uploading only derived fields — if it did, the difference would narrow.

### Verdict

**Not formally validated.** The hybrid architecture is fully implemented and its design rationale for lower latency and reduced bandwidth is logically consistent. However, H2 requires a comparative experiment against a cloud-only control configuration with measured latency and bandwidth figures, which was not conducted. The hypothesis is supported by design reasoning but not by empirical evidence.

---

## H3: Real-Time Dashboard Visualization vs Notification-Only Alerting

> **Real-time visualization via a monitoring dashboard enables faster user response to physiological anomalies compared to notification-only alerting.**

### System Design Evidence

The MediSync dashboard provides continuous, real-time visual feedback through three complementary components:

- **StatusCard** — A prominent, colour-coded status indicator (NORMAL / WARNING / DANGER) that updates on every SSE event. The DANGER state includes a CSS pulse animation to draw immediate attention without requiring the nurse to actively watch the screen.
- **GaugeCard** — Three SVG arc gauges (SpO₂, BPM, Temperature) with colour-coded zones, providing at-a-glance trend awareness alongside the discrete status label.
- **LiveChart** — A scrolling Recharts time-series chart showing the last 60 readings per metric, enabling nurses to observe trends and rate of change rather than only the instantaneous value.

This design allows a nurse at the bedside to passively detect anomalies — the pulsing red StatusCard is visible from across the room — without needing to actively check a device or act on a push notification.

By contrast, a notification-only system (SMS, push alert, or alarm sound) delivers a discrete trigger but provides no continuous context: the nurse must then locate the patient and access a device to assess current values. The dashboard eliminates this lookup step by keeping all relevant values immediately visible.

### Evaluation

The dashboard design is well-suited to enabling faster anomaly response for users who are co-located with a screen (bedside nurses, ward stations). The persistent visual display, combined with animated danger state, reduces cognitive overhead compared to reacting to a notification and then separately retrieving patient data.

For remote admin users, the cloud dashboard (`/patient/[id]`) replicates the same components via cloud SSE, providing equivalent visual context when reviewing a specific patient remotely.

### Limitations

- **No user study was conducted.** H3 is a human-factors hypothesis that requires a controlled experiment: participants using the dashboard vs a notification-only system, with response times measured from anomaly onset to user action.
- No notification-only baseline system was implemented.
- Response time advantage may vary significantly by ward layout, staffing ratios, and familiarity with the dashboard.
- The hypothesis does not distinguish between anomaly *detection* time (how quickly the user notices) and *response* time (how quickly they act), which are different quantities.

### Verdict

**Not empirically validated.** The dashboard design provides a strong rationale for faster anomaly response and aligns with established principles in clinical alarm management and ambient display research. However, formal validation requires a user study with a notification-only control condition, which was not conducted within this project.

---

## Summary

| Hypothesis | Verdict | Evidence Basis |
|---|---|---|
| H1 — Real-time latency within acceptable threshold | Partially supported | System architecture + observed behaviour; no measured latency distribution |
| H2 — Hybrid < cloud-only (latency + bandwidth) | Not formally validated | Design rationale only; no cloud-only baseline or comparative benchmark |
| H3 — Dashboard enables faster anomaly response | Not formally validated | Design rationale + HCI principles; no user study conducted |

---

## Recommendations for Full Validation

### H1
- Add latency instrumentation: record `t_sent` in `serial_bridge.py` and `t_rendered` in the SSE consumer, log the delta per reading.
- Define an explicit latency SLA (e.g., "95th percentile < 2 seconds for bedside path") and collect 1,000+ measurements.

### H2
- Implement a minimal cloud-only path (ESP32 → WiFi → Railway directly) as a control configuration.
- Use `tcpdump` or Wireshark on the bedside machine to measure bytes/s uploaded in each configuration.
- Compare median latency and total cloud bandwidth over a fixed observation window (e.g., 10 minutes continuous operation).

### H3
- Recruit 10–20 participants (nursing students or healthcare professionals).
- Present simulated anomaly scenarios in randomised order under dashboard and notification-only conditions.
- Measure time-to-acknowledgement and accuracy of first assessment.
- Analyse with a paired t-test or Wilcoxon signed-rank test.
