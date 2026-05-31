"""
measure_o4_cdss_ttfb.py — O4 AI CDSS Streaming TTFB Measurement
================================================================

Measures Time-To-First-Byte (TTFB) for the AI Health Summary SSE endpoint:

  GET /api/patients/:id/summary?range=24h

  TTFB = time from HTTP request sent → first `chunk` event received

The `meta` event arrives first (period + reading count, fired before any
Claude token).  TTFB here is measured to the first `chunk` event (first
actual text token from the model), which is the clinically meaningful delay.

Prerequisite
------------
- Cloud Railway backend running with a valid ANTHROPIC_API_KEY
- Patient must have ≥ 2 readings in the selected range (default: 24h)
- Supabase JWT from the admin dashboard (DevTools → Cookies → sb-token)

Usage
-----
    python measure_o4_cdss_ttfb.py \\
        --patient <patient-uuid> \\
        --token   <supabase-jwt>

    python measure_o4_cdss_ttfb.py \\
        --patient <uuid> \\
        --token   <jwt> \\
        --samples 20 \\
        --range   24h \\
        --url     https://medisync-cloud-api-production.up.railway.app

Results are written to o4_cdss_results.md in the project root.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

CLOUD_API_DEFAULT = "https://medisync-cloud-api-production.up.railway.app"
OUTPUT_PATH       = Path(__file__).parent / "o4_cdss_results.md"
TTFB_SLA_MS       = 500.0   # design target: first chunk token within 500 ms


def measure_ttfb(url: str, patient_id: str, token: str, range_: str) -> dict:
    """
    Stream one summary request and return timing metrics.

    Returns a dict with keys:
        ttfb_ms     — ms from request start to first `chunk` event
        meta_ms     — ms to `meta` event (should be before first chunk)
        done_ms     — ms to `done` event (full stream duration)
        token_count — number of `chunk` events received
        error       — string if something went wrong, else None
    """
    summary_url = f"{url.rstrip('/')}/api/patients/{patient_id}/summary"
    headers     = {"Authorization": f"Bearer {token}"}
    params      = {"range": range_}

    t_start  = time.monotonic()
    meta_ms  = None
    ttfb_ms  = None
    done_ms  = None
    chunks   = 0

    try:
        with requests.get(
            summary_url, headers=headers, params=params,
            stream=True, timeout=60
        ) as resp:
            if resp.status_code == 401:
                return {"error": "401 Unauthorized — token invalid or expired"}
            if resp.status_code == 404:
                return {"error": f"404 — patient not found: {patient_id}"}
            if resp.status_code == 422:
                return {"error": "422 — fewer than 2 readings in range; choose a wider --range"}
            if resp.status_code != 200:
                return {"error": f"HTTP {resp.status_code}"}

            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                if not line.startswith("data:"):
                    continue

                now_ms = (time.monotonic() - t_start) * 1000
                try:
                    event = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type")

                if event_type == "meta" and meta_ms is None:
                    meta_ms = round(now_ms, 1)

                elif event_type == "chunk":
                    if ttfb_ms is None:
                        ttfb_ms = round(now_ms, 1)
                    chunks += 1

                elif event_type == "done":
                    done_ms = round(now_ms, 1)
                    break

                elif event_type == "error":
                    return {"error": f"server error: {event.get('message', 'unknown')}"}

    except requests.exceptions.Timeout:
        return {"error": "request timed out (60 s)"}
    except requests.exceptions.RequestException as exc:
        return {"error": str(exc)}

    if ttfb_ms is None:
        return {"error": "no chunk events received — is the model responding?"}

    return {
        "ttfb_ms":     ttfb_ms,
        "meta_ms":     meta_ms,
        "done_ms":     done_ms,
        "token_count": chunks,
        "error":       None,
    }


def compute_stats(values: list[float]) -> dict:
    values.sort()
    n = len(values)
    return {
        "count":   n,
        "min_ms":  round(values[0], 1),
        "max_ms":  round(values[-1], 1),
        "mean_ms": round(sum(values) / n, 1),
        "p50_ms":  round(values[int(n * 0.50)], 1),
        "p95_ms":  round(values[min(int(n * 0.95), n - 1)], 1),
    }


def write_report(ttfb_stats: dict, raw_ttfb: list[float],
                 raw_results: list[dict], args_ns) -> None:
    now_str  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    sla_ok   = ttfb_stats["p95_ms"] < TTFB_SLA_MS
    sla_mark = "✅ PASS" if sla_ok else "❌ FAIL"

    lines = [
        "# O4 AI CDSS Streaming TTFB Results",
        "",
        f"Measured: {now_str}  ",
        f"Samples: {ttfb_stats['count']}  ",
        f"Patient: {args_ns.patient}  ",
        f"Range: {args_ns.range}  ",
        f"Cloud API: {args_ns.url}  ",
        "",
        "## TTFB Statistics (Request → First Chunk Token)",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Min    | {ttfb_stats['min_ms']} ms |",
        f"| Mean   | {ttfb_stats['mean_ms']} ms |",
        f"| Median (P50) | {ttfb_stats['p50_ms']} ms |",
        f"| P95    | {ttfb_stats['p95_ms']} ms |",
        f"| Max    | {ttfb_stats['max_ms']} ms |",
        "",
        "## SLA Evaluation",
        "",
        f"**SLA**: First chunk token delivered within {TTFB_SLA_MS:.0f} ms  ",
        f"**Result**: P95 = {ttfb_stats['p95_ms']} ms — {sla_mark}",
        "",
        "## Per-Sample Detail",
        "",
        "| # | Meta (ms) | TTFB/Chunk (ms) | Stream Done (ms) | Tokens |",
        "|---|-----------|-----------------|------------------|--------|",
    ]

    for i, r in enumerate(raw_results, 1):
        if r.get("error"):
            lines.append(f"| {i} | — | ERROR: {r['error'][:40]} | — | — |")
        else:
            meta = f"{r['meta_ms']}" if r.get("meta_ms") else "—"
            lines.append(
                f"| {i} | {meta} | **{r['ttfb_ms']}** | {r['done_ms']} | {r['token_count']} |"
            )

    lines += [
        "",
        "---",
        "_Generated by `measure_o4_cdss_ttfb.py`_",
    ]

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="O4 AI CDSS TTFB measurement")
    parser.add_argument("--url",     default=CLOUD_API_DEFAULT, help="Cloud API base URL")
    parser.add_argument("--patient", required=True,             help="Patient UUID")
    parser.add_argument("--token",   required=True,             help="Supabase JWT (sb-token cookie)")
    parser.add_argument("--samples", type=int, default=20,      help="Number of summary requests (default 20)")
    parser.add_argument("--range",   default="24h",             choices=["1h", "6h", "24h", "7d"])
    args = parser.parse_args()

    print("[o4-measure] AI CDSS TTFB Measurement")
    print(f"[o4-measure] API     : {args.url}")
    print(f"[o4-measure] Patient : {args.patient}")
    print(f"[o4-measure] Range   : {args.range}")
    print(f"[o4-measure] Samples : {args.samples}")
    print(f"[o4-measure] SLA     : first chunk < {TTFB_SLA_MS:.0f} ms\n")

    raw_ttfb: list[float] = []
    raw_results: list[dict] = []

    for i in range(1, args.samples + 1):
        print(f"  [{i:>3}/{args.samples}] Requesting summary …", end=" ", flush=True)
        result = measure_ttfb(args.url, args.patient, args.token, args.range)

        if result.get("error"):
            print(f"❌ {result['error']}")
            raw_results.append(result)
            if "401" in str(result["error"]):
                print("[o4-measure] Token expired — aborting.")
                break
            continue

        ttfb = result["ttfb_ms"]
        sla  = "✅" if ttfb < TTFB_SLA_MS else "❌"
        print(f"{sla} TTFB={ttfb} ms | meta={result['meta_ms']} ms | done={result['done_ms']} ms | {result['token_count']} tokens")
        raw_ttfb.append(ttfb)
        raw_results.append(result)

        # brief pause between requests to avoid hammering Railway + Anthropic
        if i < args.samples:
            time.sleep(2)

    if len(raw_ttfb) < 5:
        print(f"[o4-measure] Only {len(raw_ttfb)} valid samples — need at least 5. Aborting.")
        sys.exit(1)

    stats = compute_stats(raw_ttfb)

    print(f"\n── Results ──────────────────────────────────────────")
    print(f"  Samples : {stats['count']}")
    print(f"  Min     : {stats['min_ms']} ms")
    print(f"  Mean    : {stats['mean_ms']} ms")
    print(f"  P50     : {stats['p50_ms']} ms")
    print(f"  P95     : {stats['p95_ms']} ms")
    print(f"  Max     : {stats['max_ms']} ms")
    sla_ok = stats["p95_ms"] < TTFB_SLA_MS
    print(f"  SLA (P95 < {TTFB_SLA_MS:.0f} ms): {'PASS ✅' if sla_ok else 'FAIL ❌'}\n")

    write_report(stats, raw_ttfb, raw_results, args)
    print(f"[o4-measure] Report written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
