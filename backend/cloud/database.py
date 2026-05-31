import os
import re

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient
from supabase import create_client, Client

load_dotenv()

# InfluxDB Cloud
_influx_url = os.getenv("CLOUD_INFLUX_URL")
_influx_token = os.getenv("CLOUD_INFLUX_TOKEN")
_influx_org = os.getenv("CLOUD_INFLUX_ORG")
_influx_bucket = os.getenv("CLOUD_INFLUX_BUCKET")

_influx_client = InfluxDBClient(url=_influx_url, token=_influx_token, org=_influx_org)
_query_api = _influx_client.query_api()

# Supabase
_supa_url = os.getenv("SUPABASE_URL")
_supa_key = os.getenv("SUPABASE_SERVICE_KEY")

_missing = [k for k, v in {"SUPABASE_URL": _supa_url, "SUPABASE_SERVICE_KEY": _supa_key}.items() if not v]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}. Copy .env.example to .env and fill in real values.")

supabase: Client = create_client(_supa_url, _supa_key)

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _validate_uuid(value: str) -> str:
    if not _UUID_RE.match(value):
        raise ValueError(f"Invalid UUID: {value}")
    return value


def _record_to_reading(record) -> dict:
    v = record.values
    return {
        "spo2": v.get("spo2"),
        "bpm": v.get("bpm"),
        "temperature": v.get("temperature"),
        "status": v.get("status", "normal"),
        "prediction": v.get("prediction", "normal"),
        "confidence": float(v.get("confidence", 0.0)),
        "alert": bool(v.get("alert", False)),
        "ts": record.get_time().isoformat(),
        "bridge_ts": v.get("bridge_ts"),
    }


def get_latest_reading(patient_id: str) -> dict | None:
    _validate_uuid(patient_id)
    flux = f"""
from(bucket: "{_influx_bucket}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "health_readings")
  |> filter(fn: (r) => r.patient_id == "{patient_id}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1)
"""
    tables = _query_api.query(flux, org=_influx_org)
    for table in tables:
        for record in table.records:
            return _record_to_reading(record)
    return None


def get_history(patient_id: str, start: str, stop: str) -> list[dict]:
    _validate_uuid(patient_id)
    flux = f"""
from(bucket: "{_influx_bucket}")
  |> range(start: {start}, stop: {stop})
  |> filter(fn: (r) => r._measurement == "health_readings")
  |> filter(fn: (r) => r.patient_id == "{patient_id}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
"""
    tables = _query_api.query(flux, org=_influx_org)
    results = []
    for table in tables:
        for record in table.records:
            results.append(_record_to_reading(record))
    return results
