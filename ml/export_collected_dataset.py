"""
export_collected_dataset.py — Export MediSync's own collected vitals from InfluxDB Cloud

Pulls every point ever written to the `health_readings` measurement in the
cloud bucket, anonymises the `patient_id` tag (UUID -> sequential subject_id,
ordered by first reading), and writes a clean CSV ready for a Zenodo upload.

This is NOT the Kaggle training data (see ml/raw/) — this is the real sensor
data this project's own ESP32 + bedside pipeline collected during development
and testing.

PRIVACY: do not upload the output of this script to Zenodo (or anywhere public)
until you have confirmed every person who wore the device during data collection
consents to their anonymised physiological readings being published. The output
CSV contains no names/IC numbers/ward (those live only in Supabase, never in
InfluxDB), but the readings themselves are still personal health data under PDPA/
GDPR-style definitions even when the UUID is replaced with a sequential ID.

Usage:
    python ml/export_collected_dataset.py
"""
import csv
import os

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", "cloud", ".env"))

INFLUX_URL = os.getenv("CLOUD_INFLUX_URL")
INFLUX_TOKEN = os.getenv("CLOUD_INFLUX_TOKEN")
INFLUX_ORG = os.getenv("CLOUD_INFLUX_ORG")
INFLUX_BUCKET = os.getenv("CLOUD_INFLUX_BUCKET")

OUT_DIR = os.path.join(os.path.dirname(__file__), "collected_data")
OUT_CSV = os.path.join(OUT_DIR, "medisync_collected_readings.csv")
OUT_MAPPING = os.path.join(OUT_DIR, "_patient_id_mapping_DO_NOT_PUBLISH.csv")

FLUX_QUERY = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: 0)
  |> filter(fn: (r) => r["_measurement"] == "health_readings")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
'''


def main():
    missing = [k for k, v in {
        "CLOUD_INFLUX_URL": INFLUX_URL, "CLOUD_INFLUX_TOKEN": INFLUX_TOKEN,
        "CLOUD_INFLUX_ORG": INFLUX_ORG, "CLOUD_INFLUX_BUCKET": INFLUX_BUCKET,
    }.items() if not v]
    if missing:
        raise SystemExit(f"Missing env vars: {', '.join(missing)} — check backend/cloud/.env")

    os.makedirs(OUT_DIR, exist_ok=True)

    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
    tables = client.query_api().query(FLUX_QUERY)

    rows = []
    for table in tables:
        for record in table.records:
            v = record.values
            rows.append({
                "ts": record.get_time().isoformat(),
                "patient_id": v.get("patient_id"),
                "spo2": v.get("spo2"),
                "bpm": v.get("bpm"),
                "temperature": v.get("temperature"),
                "status": v.get("status"),
                "prediction": v.get("prediction"),
                "confidence": v.get("confidence"),
                "alert": v.get("alert"),
                "bridge_ts": v.get("bridge_ts"),
            })
    client.close()

    if not rows:
        print("No rows found in health_readings — nothing to export.")
        return

    rows.sort(key=lambda r: r["ts"])

    # Anonymise patient_id -> subject_01, subject_02, ... ordered by first appearance
    anon_map = {}
    for r in rows:
        pid = r["patient_id"]
        if pid not in anon_map:
            anon_map[pid] = f"subject_{len(anon_map) + 1:02d}"
        r["anon_subject_id"] = anon_map[pid]

    fieldnames = ["ts", "anon_subject_id", "spo2", "bpm", "temperature",
                  "status", "prediction", "confidence", "alert", "bridge_ts"]
    with open(OUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    with open(OUT_MAPPING, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["patient_id_uuid", "anon_subject_id"])
        for pid, anon_id in anon_map.items():
            writer.writerow([pid, anon_id])

    print(f"Exported {len(rows)} readings across {len(anon_map)} subjects.")
    print(f"  Public-safe CSV : {OUT_CSV}")
    print(f"  Private mapping : {OUT_MAPPING}  (gitignored — never publish this file)")


if __name__ == "__main__":
    main()
