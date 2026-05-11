---
name: MediSync Implementation Phases
description: Ordered 10-phase build plan — what's done, what's next, and dependencies between phases
type: project
---

All phases are pending as of 2026-05-11 (initial commit). Build order is strict — later phases depend on earlier ones.

| Phase | Description | Key deliverable |
|---|---|---|
| 1 | Local InfluxDB (Docker) | Test point written + queried via Python |
| 2 | InfluxDB Cloud setup | Test point appears in Cloud UI |
| 3 | Supabase schema + auth | `patients`, `sessions`, `alerts` tables; first admin account |
| 4 | Local FastAPI backend | POST reading → status calculated → InfluxDB → SSE stream |
| 5 | Cloud FastAPI backend | History + live stream from Railway with JWT auth |
| 6 | Bedside frontend | Full nurse flow: register → dashboard → StatusCard live → logout |
| 7 | Admin frontend | Admin login → patient list → View → live StatusCard + chart |
| 8 | ESP32 firmware | Real sensor values updating bedside StatusCard every second |
| 9 | ML anomaly detection | AlertBadge shows alongside StatusCard; < 5% false positives |
| 10 | Polish & hardening | SQLite sync queue persistence, SSE reconnect, alert writes |

**Why:** Phases 1–3 are infrastructure only. Phase 4 is the first runnable end-to-end slice (sensor → DB → SSE). Phase 6 is the first usable product for nurses. ML (Phase 9) is purely additive — StatusCard works without it.

**How to apply:** Never block Phase 4–8 work on Phase 9. If asked to implement anything, confirm which phase it belongs to and whether its prerequisites are done.
