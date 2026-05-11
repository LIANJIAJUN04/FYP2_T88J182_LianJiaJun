# MediSync Memory Index

- [Project Overview](project_overview.md) — Dual-mode IoT health monitor: bedside local + cloud admin, why the two-path design exists
- [Implementation Phases](project_phases.md) — 10-phase build plan, current status (all pending as of 2026-05-11), phase dependencies
- [Architecture Decisions](project_architecture.md) — Active patient state, status logic rules, cloud sync pattern, component convention, auth split, InfluxDB tagging
- [API Contract](project_api_contract.md) — All endpoints for local and cloud FastAPI, SSE payload shape
- [Data Schema](project_schema.md) — Supabase tables (patients, sessions, alerts) and InfluxDB measurement model
