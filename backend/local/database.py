import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

_url = os.getenv("LOCAL_INFLUX_URL", "http://localhost:8086")
_token = os.getenv("LOCAL_INFLUX_TOKEN")
_org = os.getenv("LOCAL_INFLUX_ORG")
_bucket = os.getenv("LOCAL_INFLUX_BUCKET")

_client = InfluxDBClient(url=_url, token=_token, org=_org)
_write_api = _client.write_api(write_options=SYNCHRONOUS)
_query_api = _client.query_api()


def write_reading(
    patient_id: str,
    spo2: float,
    bpm: int,
    temperature: float,
    status: str,
    prediction: str = "normal",
    alert: bool = False,
) -> None:
    point = (
        Point("health_readings")
        .tag("patient_id", patient_id)
        .field("spo2", float(spo2))
        .field("bpm", int(bpm))
        .field("temperature", float(temperature))
        .field("status", status)
        .field("prediction", prediction)
        .field("alert", alert)
        .time(datetime.now(timezone.utc), WritePrecision.NS)
    )
    _write_api.write(bucket=_bucket, org=_org, record=point)
