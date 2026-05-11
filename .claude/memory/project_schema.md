---
name: MediSync Data Schema
description: Supabase Postgres tables and InfluxDB measurement model
type: project
---

## Supabase (Postgres)

```sql
patients (id UUID PK, name TEXT, ic_number TEXT UNIQUE, ward TEXT, age INT, gender TEXT, assigned_doctor TEXT, created_at TIMESTAMPTZ)
sessions (id UUID PK, patient_id UUID FK→patients, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ nullable)
alerts   (id UUID PK, patient_id UUID FK→patients, metric TEXT, value FLOAT, triggered_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ nullable)
```

`ended_at IS NULL` means the session is currently active.
`resolved_at IS NULL` means the alert is unresolved.
Admins are in `auth.users` — managed by Supabase Auth, not a custom table.

## InfluxDB — measurement: `health_readings`

**Fields:** `spo2` (float), `bpm` (int), `temperature` (float), `status` (string), `prediction` (string), `alert` (bool)

**Tags:** `patient_id` (UUID) — mandatory on every write

**Retention:** local = 7 days, cloud = 30 days (free tier)

**Write limit (cloud):** 5 MB per 5 minutes — sufficient for 1s polling prototype.
