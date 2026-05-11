---
name: MediSync Project Overview
description: Core architecture, goals, and dual-mode design of the MediSync wearable health monitor
type: project
---

MediSync is a real-time IoT patient health monitoring system. An ESP32 with SpO₂, BPM, and temperature sensors sends readings to a bedside FastAPI backend, which writes to local InfluxDB and asynchronously syncs to InfluxDB Cloud. There are two independent frontends: a bedside Next.js app (localhost) for nurses and a cloud Next.js app (Vercel) for admins.

**Why:** Near-zero latency at bedside (~1ms from local InfluxDB) while enabling remote admin visibility with 1–3s cloud latency.

**How to apply:** Every architectural decision should preserve this dual-path design. Local writes must never block on cloud sync — the async queue in `sync.py` is critical. Do not merge the two frontends or two backends into one app.
