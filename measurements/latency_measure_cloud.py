"""
latency_measure_cloud.py — H2 Cloud Path Latency Measurement
=============================================================

Measures end-to-end latency on the cloud-only data path:

  ESP32 → MQTT → mqtt_bridge.py (stamps bridge_ts)
       → POST /api/readings → FastAPI (local)
       → sync.py → InfluxDB Cloud (async)
       → Railway FastAPI → SSE
       → this script (records t_received)

  latency_ms = t_received − bridge_ts

bridge_ts is stamped on the bedside machine; t_received is also on the
bedside machine — clock skew = 0. Network RTT to Railway is included.

This naturally captures:
  • Local processing time (~50–150 ms)
  • Async cloud sync delay (0–5 s backpressure)
  • InfluxDB Cloud write + propagation
  • Railway SSE poll interval (≤ 2 s)
  • Railway → bedside client RTT (~50–300 ms)

Usage
-----
    python latency_measure_cloud.py \\
        --patient <patient-uuid> \\
        --token   <supabase-jwt>

    python latency_measure_cloud.py \\
        --patient <patient-uuid> \\
        --token   <supabase-jwt> \\
        --samples 300 \\
        --url     https://medisync-cloud-api-production.up.railway.app

How to get the token
--------------------
1. Log into the admin dashboard in a browser.
2. Open DevTools → Application → Cookies.
3. Copy the value of the `sb-token` cookie.

Results are written to latency_results_cloud.md in the project root.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

CLOUD_API_DEFAULT = "https://medisync-cloud-api-production.up.railway.app"
OUTPUT_PATH = Path(__file__).parent / "latency_results_cloud.md"


def stream_cloud_latencies(url: str, patient_id: str, token: str, target: int):
    """Connect to the cloud SSE stream and yield latency_ms values."""
    sse_url = f"{url.rstrip('/')}/api/patients/{patient_id}/stream"
    params = {"token": token}

    print(f"[cloud-measure] Connecting to cloud SSE:")
    print(f"  {sse_url}")
    print(f"[cloud-measure] Collecting {target} samples (Ctrl-C to stop early).\n")

    with requests.get(sse_url, params=params, stream=True, timeout=30) as resp:
        if resp.status_code == 401:
            print("[cloud-measure] ❌  401 Unauthorized — token is invalid or expired.")
            print("  Get a fresh token from the admin dashboard → DevTools → Cookies → sb-token")
            sys.exit(1)
        if resp.status_code == 404:
            print(f"[cloud-measure] ❌  404 — patient_id not found: {patient_id}")
            sys.exit(1)
        resp.raise_for_status()

        collected = 0

        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line

            if line.startswith(":"):
                # keep-alive comment — not a data event
                continue
            if not line.startswith("data:"):
                continue

            t_received = datetime.now(timezone.utc)
            try:
                payload = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue

            # Prefer bridge_ts (stamped at MQTT receive); fall back to ts
            # (stamped by local FastAPI, ~50–150 ms later) when the cloud
            # backend hasn't been redeployed with the bridge_ts field yet.
            ref_str = payload.get("bridge_ts") or payload.get("ts")
            if not ref_str:
                continue

            try:
                ref_ts = datetime.fromisoformat(ref_str)
                ms = (t_received - ref_ts).total_seconds() * 1000
            except ValueError:
                continue

            # Discard impossible values (negative or > 60 s — far beyond any real path)
            if ms < 0 or ms > 60_000:
                continue

            collected += 1
            print(f"  [{collected:>4}/{target}]  latency = {ms:>8.1f} ms")
            yield ms

            if collected >= target:
                break


def compute_stats(values: list[float]) -> dict:
    values.sort()
    n = len(values)
    mean = sum(values) / n
    p50  = values[int(n * 0.50)]
    p95  = values[int(n * 0.95)]
    p99  = values[min(int(n * 0.99), n - 1)]
    return {
        "count":   n,
        "min_ms":  round(values[0], 1),
        "max_ms":  round(values[-1], 1),
        "mean_ms": round(mean, 1),
        "p50_ms":  round(p50, 1),
        "p95_ms":  round(p95, 1),
        "p99_ms":  round(p99, 1),
    }


def write_report(stats: dict, raw: list[float], patient_id: str, api_url: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "# H2 Cloud Path Latency Measurement Results",
        "",
        f"Measured: {now}  ",
        f"Samples: {stats['count']}  ",
        f"Patient: {patient_id}  ",
        f"Cloud API: {api_url}  ",
        "Transport: ESP32 → WiFi → MQTT → mqtt_bridge → Local FastAPI → sync.py → InfluxDB Cloud → Railway FastAPI → SSE  ",
        "",
        "## Summary Statistics",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Min    | {stats['min_ms']} ms |",
        f"| Mean   | {stats['mean_ms']} ms |",
        f"| Median (P50) | {stats['p50_ms']} ms |",
        f"| P95    | {stats['p95_ms']} ms |",
        f"| P99    | {stats['p99_ms']} ms |",
        f"| Max    | {stats['max_ms']} ms |",
        "",
        "## Comparison with Bedside (H1) Path",
        "",
        "| Path | Mean | P95 | Source |",
        "|------|------|-----|--------|",
        "| Hybrid bedside (H1) | 619.9 ms | 1 172.5 ms | latency_results.md, 600 samples, 2026-05-30 |",
        f"| Cloud-only (H2)     | {stats['mean_ms']} ms | {stats['p95_ms']} ms | This file, {stats['count']} samples, {now[:10]} |",
        "",
        "## Raw Observations (ms)",
        "",
        "```",
        ", ".join(f"{v:.0f}" for v in raw),
        "```",
        "",
        "---",
        "_Generated by `latency_measure_cloud.py`_",
    ]

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[cloud-measure] Report written to {OUTPUT_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description="H2 cloud path latency measurement")
    parser.add_argument("--url",      default=CLOUD_API_DEFAULT, help="Cloud API base URL")
    parser.add_argument("--patient",  required=True,             help="Patient UUID")
    parser.add_argument("--token",    required=True,             help="Supabase JWT (from sb-token cookie)")
    parser.add_argument("--samples",  type=int, default=300,     help="Number of readings to collect")
    args = parser.parse_args()

    print("[cloud-measure] H2 Cloud Path Latency Measurement")
    print(f"[cloud-measure] API: {args.url}")
    print(f"[cloud-measure] Patient: {args.patient}")
    print(f"[cloud-measure] Target: {args.samples} samples\n")

    raw: list[float] = []
    try:
        for ms in stream_cloud_latencies(args.url, args.patient, args.token, args.samples):
            raw.append(ms)
    except KeyboardInterrupt:
        print("\n[cloud-measure] Interrupted — computing stats on collected samples …")
    except Exception as exc:
        print(f"[cloud-measure] Error: {exc}", file=sys.stderr)
        sys.exit(1)

    if len(raw) < 10:
        print(f"[cloud-measure] Only {len(raw)} samples — need at least 10 to report. Aborting.")
        sys.exit(1)

    stats = compute_stats(raw)

    print("\n── Results ──────────────────────────────────────────")
    print(f"  Samples : {stats['count']}")
    print(f"  Min     : {stats['min_ms']} ms")
    print(f"  Mean    : {stats['mean_ms']} ms")
    print(f"  P50     : {stats['p50_ms']} ms")
    print(f"  P95     : {stats['p95_ms']} ms")
    print(f"  P99     : {stats['p99_ms']} ms")
    print(f"  Max     : {stats['max_ms']} ms")
    print(f"\n  Bedside (H1) P95: 1 172.5 ms")
    print(f"  Cloud   (H2) P95: {stats['p95_ms']} ms")
    ratio = stats["mean_ms"] / 619.9
    print(f"  Ratio (cloud mean / bedside mean): {ratio:.1f}×")

    write_report(stats, raw, args.patient, args.url)


if __name__ == "__main__":
    main()
