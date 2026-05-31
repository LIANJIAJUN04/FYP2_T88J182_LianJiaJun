"""
latency_measure.py — H1 Empirical Latency Measurement Tool
===========================================================

Measures end-to-end latency on the bedside data path:

  ESP32 → MQTT → mqtt_bridge.py (stamps bridge_ts)
       → POST /api/readings → FastAPI (app.state.last_reading)
       → GET /api/stream (SSE)
       → this script (records t_received)

  latency_ms = t_received − bridge_ts

Both timestamps are on the same machine (localhost), so clock skew = 0.

This script is designed to run automatically after "MediSync: Start All".
It will wait for FastAPI to be ready, then wait for an active patient session,
then collect samples and write results to latency_results.md.

Usage
-----
    python latency_measure.py                # collect 300 samples (~5 min)
    python latency_measure.py --samples 600  # collect 600 samples (~10 min)

Results are written to latency_results.md in the project root.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

SSE_URL_DEFAULT  = "http://localhost:8000/api/stream"
HEALTH_URL       = "http://localhost:8000/health"
OUTPUT_PATH      = Path(__file__).parent / "latency_results.md"
BACKEND_RETRY_S  = 3    # seconds between backend readiness checks
BACKEND_TIMEOUT  = 120  # max seconds to wait for backend to come up


def wait_for_backend() -> None:
    """Block until FastAPI /health returns 200, then return."""
    print("[measure] Waiting for FastAPI backend to be ready …")
    deadline = time.monotonic() + BACKEND_TIMEOUT
    while time.monotonic() < deadline:
        try:
            r = requests.get(HEALTH_URL, timeout=3)
            if r.status_code == 200:
                print("[measure] Backend is ready.\n")
                return
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(BACKEND_RETRY_S)
    print(f"[measure] Backend did not become ready within {BACKEND_TIMEOUT}s. Aborting.")
    sys.exit(1)


def stream_latencies(url: str, target: int):
    """Connect to the SSE stream and yield latency_ms values until target is reached."""
    print(f"[measure] Connecting to SSE stream …")
    print(f"[measure] Waiting for an active patient session — log in via the bedside dashboard now.")
    print(f"[measure] Measurement will start automatically once readings flow.\n")
    with requests.get(url, stream=True, timeout=30) as resp:
        resp.raise_for_status()
        print(f"[measure] Connected. Collecting {target} samples (Ctrl-C to stop early).\n")
        collected = 0
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
            if not line.startswith("data:"):
                continue

            t_received = datetime.now(timezone.utc)
            try:
                payload = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue

            bridge_ts_str = payload.get("bridge_ts")
            if not bridge_ts_str:
                continue

            try:
                bridge_ts = datetime.fromisoformat(bridge_ts_str)
                ms = (t_received - bridge_ts).total_seconds() * 1000
            except ValueError:
                continue

            # Sanity guard: discard impossible values (negative or >30 s)
            if ms < 0 or ms > 30_000:
                continue

            collected += 1
            print(f"  [{collected:>4}/{target}]  latency = {ms:>7.1f} ms")
            yield ms

            if collected >= target:
                break


def compute_stats(values: list[float]) -> dict:
    values.sort()
    n = len(values)
    mean  = sum(values) / n
    p50   = values[int(n * 0.50)]
    p95   = values[int(n * 0.95)]
    p99   = values[min(int(n * 0.99), n - 1)]
    return {
        "count": n,
        "min_ms":  round(values[0], 1),
        "max_ms":  round(values[-1], 1),
        "mean_ms": round(mean, 1),
        "p50_ms":  round(p50, 1),
        "p95_ms":  round(p95, 1),
        "p99_ms":  round(p99, 1),
    }


def write_report(stats: dict, raw: list[float]) -> None:
    sla_ok = stats["p95_ms"] < 2000
    sla_label = "✅ PASS" if sla_ok else "❌ FAIL"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "# H1 Latency Measurement Results",
        f"\nMeasured: {now}  ",
        f"Samples: {stats['count']}  ",
        f"Transport: ESP32 → WiFi → MQTT → mqtt_bridge → FastAPI → SSE  ",
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
        "## SLA Evaluation",
        "",
        f"**SLA**: 95th-percentile bedside end-to-end latency < 2 000 ms  ",
        f"**Result**: P95 = {stats['p95_ms']} ms — {sla_label}",
        "",
        "## Raw Observations (ms)",
        "",
        "```",
        ", ".join(f"{v:.0f}" for v in raw),
        "```",
        "",
        "---",
        "_Generated by `latency_measure.py`_",
    ]

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[measure] Report written to {OUTPUT_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description="H1 latency measurement tool")
    parser.add_argument("--url",     default=SSE_URL_DEFAULT, help="SSE stream URL")
    parser.add_argument("--samples", type=int, default=300,   help="Number of readings to collect")
    args = parser.parse_args()

    wait_for_backend()

    raw: list[float] = []
    try:
        for ms in stream_latencies(args.url, args.samples):
            raw.append(ms)
    except KeyboardInterrupt:
        print("\n[measure] Interrupted — computing stats on collected samples …")
    except Exception as exc:
        print(f"[measure] Error: {exc}", file=sys.stderr)
        sys.exit(1)

    if len(raw) < 10:
        print(f"[measure] Only {len(raw)} samples — need at least 10 to report. Aborting.")
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
    sla_ok = stats["p95_ms"] < 2000
    print(f"  SLA (P95 < 2000ms): {'PASS ✅' if sla_ok else 'FAIL ❌'}")

    write_report(stats, raw)


if __name__ == "__main__":
    main()
