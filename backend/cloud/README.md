# Cloud Backend

FastAPI backend deployed on Railway. Serves the admin frontend with authenticated access to InfluxDB Cloud history, live SSE streams, alert logs, session logs, and on-demand AI clinical summaries.

## Requirements

- Python 3.11+
- `.env` file — copy from `.env.example` and fill in values

```bash
pip install -r requirements.txt
```

## Running Locally

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## Deploying to Railway

- Root directory: `/backend/cloud`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all environment variables in the Railway dashboard

## Environment Variables

| Variable | Description |
|---|---|
| `CLOUD_INFLUX_URL` | InfluxDB Cloud endpoint |
| `CLOUD_INFLUX_TOKEN` | InfluxDB Cloud API token (read + write) |
| `CLOUD_INFLUX_ORG` | InfluxDB Cloud org name |
| `CLOUD_INFLUX_BUCKET` | `health_cloud` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI summary endpoint) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `https://medi-sync-eta.vercel.app`) |

## Key Endpoints

All endpoints except `/health` require a valid Supabase JWT — pass it as `Authorization: Bearer <token>` or `?token=<token>` (SSE).

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (unauthenticated) |
| `GET` | `/api/patients` | List all patients |
| `GET` | `/api/patients/:id` | Single patient details |
| `GET` | `/api/patients/:id/stream` | SSE live stream (poll InfluxDB Cloud every 2 s) |
| `GET` | `/api/patients/:id/history` | Historical readings (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) |
| `GET` | `/api/patients/:id/sessions` | Session log |
| `GET` | `/api/patients/:id/summary` | AI clinical summary (`?range=1h\|6h\|24h\|7d`) |
| `GET` | `/api/alerts` | Alert log with joined patient info |

## AI Summary

The `/summary` endpoint fetches InfluxDB Cloud history, pre-computes per-metric statistics in Python, then sends a structured prompt to `claude-haiku-4-5`. Raw reading arrays are never sent to the model. Returns HTTP 422 if fewer than 2 readings exist for the selected period.
