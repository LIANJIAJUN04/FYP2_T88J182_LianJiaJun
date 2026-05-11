---
name: MediSync Architecture Decisions
description: Key architectural rules, constraints, and patterns to enforce across the codebase
type: project
---

## Active Patient State
`app.state.active_patient_id` lives in FastAPI memory — not a DB field, not Redis. Restarting the local backend clears it; the nurse must log in again. This is intentional — simplicity over persistence for a prototype.

## Status Logic
`status.py` is duplicated in `backend/local/` and `backend/cloud/`. They must stay identical. If they diverge, extract to a shared `lib/` folder. The rule-based status is always available from Phase 4. Never gate StatusCard on ML.

## Cloud Sync
`sync.py` runs an async queue worker. On cloud write failure, the reading is re-queued and retried after 5s. Never use `time.sleep()` — always `asyncio.sleep()`. Local writes must never await the cloud sync.

## Component Convention (Next.js)
Each component lives in its own folder: `ComponentName.tsx` (JSX only), `ComponentName.hooks.ts` (state/SSE logic), `ComponentName.utils.ts` (helpers), `ComponentName.types.ts` (interfaces). Keep JSX files markup-only.

## SSE
Both `/api/stream` (local) and `/api/patients/:id/stream` (cloud) must set `Content-Type: text/event-stream` and disable response buffering. Every event includes `status` field — frontend never recalculates it.

## Auth Split
- Bedside: single shared `NURSE_PASSWORD` env var — no per-nurse accounts, no DB storage
- Admin: Supabase Auth JWT — middleware validates on every request to cloud backend

## InfluxDB Tagging
Every reading must be tagged with `patient_id`. Queries without this tag will mix all patients' data.

## Monorepo Independence
`frontend/bedside` and `frontend/admin` are fully independent Next.js apps — separate `package.json`, separate deploys. Components can be duplicated between them; do not create a shared package.
