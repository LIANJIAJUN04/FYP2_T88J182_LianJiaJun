"""Phase 1 verification: write a test point to local InfluxDB and read it back."""
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

URL    = os.getenv("LOCAL_INFLUX_URL", "http://localhost:8086")
TOKEN  = os.getenv("LOCAL_INFLUX_TOKEN")
ORG    = os.getenv("LOCAL_INFLUX_ORG")
BUCKET = os.getenv("LOCAL_INFLUX_BUCKET")

client = InfluxDBClient(url=URL, token=TOKEN, org=ORG)

# Write
write_api = client.write_api(write_options=SYNCHRONOUS)
point = (
    Point("health_readings")
    .tag("patient_id", "test-patient-001")
    .field("spo2", 97.5)
    .field("bpm", 72)
    .field("temperature", 36.6)
    .field("status", "normal")
    .time(datetime.now(timezone.utc), WritePrecision.NS)
)
write_api.write(bucket=BUCKET, org=ORG, record=point)
print("Write OK")

# Read back
query_api = client.query_api()
query = f'''
from(bucket: "{BUCKET}")
  |> range(start: -1m)
  |> filter(fn: (r) => r._measurement == "health_readings")
  |> filter(fn: (r) => r.patient_id == "test-patient-001")
'''
tables = query_api.query(query, org=ORG)
rows = [(r.get_field(), r.get_value()) for table in tables for r in table.records]
if rows:
    print("Read OK — fields:", rows)
else:
    print("Read returned no data")

client.close()
