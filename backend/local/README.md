# Local Backend

FastAPI backend running on the bedside machine. Handles real-time sensor readings, local InfluxDB storage, Supabase patient/session management, and async cloud sync.

## Requirements

- Python 3.11+
- Local InfluxDB running via Docker (see `docker-compose.yml` in repo root)
- `.env` file — copy from `.env.example` and fill in values

```bash
pip install -r requirements.txt
```

## Running

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Or use the one-command startup from the repo root:

```bash
./start-bedside.sh
```

## Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `LOCAL_INFLUX_URL` | `http://localhost:8087` |
| `LOCAL_INFLUX_TOKEN` | `medisync-local-token` |
| `LOCAL_INFLUX_ORG` | `health-org` |
| `LOCAL_INFLUX_BUCKET` | `health_local` |
| `CLOUD_INFLUX_URL` | InfluxDB Cloud endpoint |
| `CLOUD_INFLUX_TOKEN` | InfluxDB Cloud API token |
| `CLOUD_INFLUX_ORG` | InfluxDB Cloud org name |
| `CLOUD_INFLUX_BUCKET` | `health_cloud` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `NURSE_PASSWORD` | Shared nurse login password |
| `DEVICE_SECRET` | Must match `X-Device-Secret` header from serial bridge |

## Key Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/patients` | Register new patient |
| `POST` | `/api/session/login` | Login existing patient (IC + nurse password) |
| `POST` | `/api/session/logout` | Logout current patient |
| `GET` | `/api/session/active` | Get current active patient |
| `POST` | `/api/readings` | Receive sensor reading (rate-limited: 5 req/s) |
| `GET` | `/api/stream` | SSE live stream of latest reading |

## Architecture Notes

- **Active patient state** is held in `app.state.active_patient_id` (in-memory). Server restart clears it — nurse must log in again.
- **Cloud sync** runs as a background task (`sync.py`). Pending readings survive restarts via a local SQLite file (`sync_queue.db`).
- **ML model** is loaded once at startup into `app.state.ml_model`. If artefacts are missing the endpoint still works — prediction defaults to `"normal"`.
- **Rate limiting** via `slowapi`: `POST /api/readings` is capped at 5 req/s per IP.

## ML Model

The ML anomaly detection model lives in `ml/`:

```
ml/
├── predict.py          # load_model() + run_inference()
└── model.pkl           # gitignored — retrain locally
```

See `ml/` at the repo root for training notebooks.
