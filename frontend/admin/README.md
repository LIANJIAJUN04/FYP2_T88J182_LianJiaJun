# Admin Frontend

Next.js app deployed on Vercel. Authenticated admin portal for remote patient monitoring — live streams, history charts, session logs, alert logs, and on-demand AI clinical summaries.

## Requirements

- Node.js 18+
- `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://medisync-cloud-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://rzzxrlfgmkdoarglcpdw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Running Locally

```bash
npm install
npm run dev          # dev server on :3002
npm run build && npm start   # production
```

## Deploying to Vercel

- Root directory: `/frontend/admin`
- Framework: Next.js (declared in `vercel.json`)
- Set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings

Live at: **https://medi-sync-eta.vercel.app**

## Pages

| Route | Description |
|---|---|
| `/` | Login — Supabase email + password auth |
| `/dashboard` | Summary cards + patients table (search, status/ward filter) |
| `/patient/[id]` | Live StatusCard + gauges + history chart + session log + alert log + AI summary |

`proxy.ts` redirects to `/` if the `sb-token` cookie is missing.

## Key Components

| Component | Description |
|---|---|
| `StatusCard` | Live status from cloud SSE — NORMAL / WARNING / DANGER |
| `SummaryCard` | Dashboard metric cards (total patients, active sessions, alerts, critical) |
| `PatientTable` | Searchable, filterable patient list with per-row alert counts |
| `GaugeCard` | SVG arc gauge for SpO₂, BPM, Temperature |
| `LiveChart` | Recharts scrolling chart from cloud SSE |
| `HistoryChart` | Date-range historical readings from InfluxDB Cloud |
| `AlertBadge` | ML anomaly indicator (normal / anomaly) |
| `AISummaryPanel` | On-demand AI clinical narrative via `GET /api/patients/:id/summary` |

SSE streams use `?token=<jwt>` query param (browser EventSource cannot set headers).

## Navbar Alert Badge

The navbar shows a pulsing red **"N alerts"** badge when there are unresolved alerts. It disappears when all alerts are resolved.
