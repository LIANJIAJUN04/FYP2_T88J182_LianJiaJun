# Bedside Frontend

Next.js app running on the bedside machine at `localhost:3001`. Used by nurses to register/login patients and monitor them in real time.

## Requirements

- Node.js 18+
- `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running

```bash
npm install
npm run dev          # dev server on :3001
npm run build && npm start   # production
```

Or use the one-command startup from the repo root:

```bash
./start-bedside.sh
```

## Pages

| Route | Description |
|---|---|
| `/` | Index — New Patient or Existing Patient |
| `/register` | New patient registration form |
| `/login` | Existing patient — IC number + nurse password |
| `/dashboard` | Live monitoring — StatusCard + GaugeCards + LiveChart |

`proxy.ts` blocks direct access to `/dashboard` — redirects to `/` if no active patient.

## Key Components

| Component | Description |
|---|---|
| `StatusCard` | Prominent status indicator — NORMAL / WARNING / DANGER, pulses red on danger |
| `GaugeCard` | SVG arc gauge for SpO₂, BPM, and Temperature |
| `LiveChart` | Recharts scrolling time-series (last 60 readings), tab per metric |

All components connect via SSE (`GET /api/stream`). Auto-reconnects after 3 s on network error.

## Notes

- Runs on port **3001** (3000 is reserved by another project on this machine).
- Auth is a shared nurse password validated by the local backend — no per-nurse accounts.
- Patient state is in-memory on the backend; restarting FastAPI clears it.
