import asyncio
import os

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

_url = os.getenv("CLOUD_INFLUX_URL")
_token = os.getenv("CLOUD_INFLUX_TOKEN")
_org = os.getenv("CLOUD_INFLUX_ORG")
_bucket = os.getenv("CLOUD_INFLUX_BUCKET")

sync_queue: asyncio.Queue = asyncio.Queue()


def _write_to_cloud(point: Point) -> None:
    client = InfluxDBClient(url=_url, token=_token, org=_org)
    write_api = client.write_api(write_options=SYNCHRONOUS)
    write_api.write(bucket=_bucket, org=_org, record=point)
    client.close()


async def cloud_sync_worker() -> None:
    print("[sync] Cloud sync worker started")
    while True:
        point: Point = await sync_queue.get()
        try:
            await asyncio.to_thread(_write_to_cloud, point)
            print("[sync] Cloud write ok")
        except Exception as e:
            print(f"[sync] Cloud write failed: {e} — retrying in 5s")
            await sync_queue.put(point)
            await asyncio.sleep(5)


def enqueue_reading(
    patient_id: str,
    spo2: float,
    bpm: int,
    temperature: float,
    status: str,
    prediction: str,
    alert: bool,
    ts,
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
        .time(ts, WritePrecision.NS)
    )
    sync_queue.put_nowait(point)
