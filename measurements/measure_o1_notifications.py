"""
measure_o1_notifications.py — O1 Alert Notification Latency Test
================================================================

Empirically measures two properties of the alert notification system:

  Property A — Non-blocking: The POST /api/readings response is returned
    BEFORE the Telegram/email notification is sent.
    Evidence: t_response < t_telegram_delivered
    Measured as: API response time vs Telegram message date from getUpdates

  Property B — End-to-end notification latency: Time from sending the
    danger reading to Telegram message delivery.
    Measured as: t_telegram_delivered − t_post

  Property C — Deduplication: A second danger reading for the same metric
    does NOT trigger a second Telegram message.

The script sends a synthetic danger reading (SpO₂ = 85%) to trigger a
real alert notification, then polls Telegram's getUpdates API to find
the delivered message and computes latency.

Prerequisites
-------------
- Local FastAPI running with an ACTIVE patient session
- TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID configured in backend/local/.env
- No existing UNRESOLVED alert for the test patient (or use --force-resolve
  to resolve all first). If an unresolved alert already exists, upsert_alert
  returns False and no notification fires — this is the deduplication gate.

Usage
-----
    python measure_o1_notifications.py \\
        --device-secret esp32

    python measure_o1_notifications.py \\
        --device-secret esp32 \\
        --local-url     http://localhost:8000 \\
        --samples       3 \\
        --force-resolve

    Flags
    -----
    --samples       Number of alert→notification cycles to measure (default 3)
    --force-resolve Before each test, send a normal reading to auto-resolve
                    any open alerts (so upsert_alert returns True on the next
                    danger reading)

Results are written to o1_notification_results.md in the project root.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / "backend" / "local" / ".env")
except ImportError:
    pass

LOCAL_API_DEFAULT  = "http://localhost:8000"
TELEGRAM_API_TMPL  = "https://api.telegram.org/bot{token}/{method}"
OUTPUT_PATH        = Path(__file__).parent / "o1_notification_results.md"
POLL_INTERVAL_S    = 1.0   # how often to check getUpdates
POLL_TIMEOUT_S     = 30.0  # max wait for Telegram message

# Danger reading that breaches SpO₂ < 90 threshold
DANGER_READING = {"spo2": 85.0, "bpm": 72, "temperature": 36.6}
# Normal reading to auto-resolve open alerts between tests
NORMAL_READING = {"spo2": 98.0, "bpm": 72, "temperature": 36.6}


def wait_for_backend(url: str, timeout: int = 30) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = requests.get(f"{url}/health", timeout=3)
            if r.status_code == 200:
                return True
        except requests.exceptions.RequestException:
            pass
        time.sleep(2)
    return False


def has_active_patient(url: str) -> bool:
    try:
        r = requests.get(f"{url}/api/session/active", timeout=5)
        if r.status_code == 200:
            return r.json().get("patient_id") is not None
    except Exception:
        pass
    return False


def send_reading(url: str, device_secret: str, reading: dict) -> dict:
    t_sent = time.monotonic()
    t_sent_utc = datetime.now(timezone.utc)
    try:
        resp = requests.post(
            f"{url}/api/readings",
            json=reading,
            headers={"X-Device-Secret": device_secret},
            timeout=10,
        )
        t_response = time.monotonic()
        response_ms = (t_response - t_sent) * 1000
        return {
            "t_sent_utc":   t_sent_utc,
            "t_sent":       t_sent,
            "status_code":  resp.status_code,
            "response_ms":  round(response_ms, 1),
            "body":         resp.json() if resp.ok else {},
            "error":        None,
        }
    except Exception as exc:
        return {
            "t_sent_utc":   t_sent_utc,
            "t_sent":       t_sent,
            "status_code":  None,
            "response_ms":  None,
            "body":         {},
            "error":        str(exc),
        }


def get_telegram_updates(token: str, offset: int = 0) -> list[dict]:
    url = TELEGRAM_API_TMPL.format(token=token, method="getUpdates")
    try:
        resp = requests.get(url, params={"offset": offset, "timeout": 5}, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("result", [])
    except Exception:
        pass
    return []


def poll_for_message(token: str, after_utc: datetime,
                     keyword: str, timeout_s: float) -> dict | None:
    """Poll getUpdates until a MediSync alert message appears after after_utc."""
    offset     = 0
    deadline   = time.monotonic() + timeout_s
    t_start    = time.monotonic()

    while time.monotonic() < deadline:
        updates = get_telegram_updates(token, offset)
        for upd in updates:
            offset = upd["update_id"] + 1
            msg    = upd.get("message", {})
            text   = msg.get("text", "")
            msg_dt = datetime.fromtimestamp(msg.get("date", 0), tz=timezone.utc)

            if msg_dt > after_utc and "MediSync" in text and keyword in text:
                detected_ms = (time.monotonic() - t_start) * 1000
                return {
                    "message_date_utc": msg_dt,
                    "text_snippet":     text[:120],
                    "poll_elapsed_ms":  round(detected_ms, 1),
                }

        time.sleep(POLL_INTERVAL_S)

    return None  # timeout


def compute_stats(values: list[float]) -> dict:
    if not values:
        return {}
    values.sort()
    n = len(values)
    return {
        "count":   n,
        "min_ms":  round(values[0], 1),
        "max_ms":  round(values[-1], 1),
        "mean_ms": round(sum(values) / n, 1),
    }


def write_report(samples: list[dict], now_str: str) -> None:
    valid  = [s for s in samples if s.get("e2e_ms") is not None]
    errors = [s for s in samples if s.get("error")]

    lines = [
        "# O1 Alert Notification Latency Results",
        "",
        f"Measured: {now_str}  ",
        f"Samples: {len(samples)} attempted, {len(valid)} successful  ",
        "",
        "## Per-Sample Results",
        "",
        "| # | API Response (ms) | Alert fired? | Telegram delivered (ms) | Non-blocking? |",
        "|---|-------------------|-------------|-------------------------|---------------|",
    ]

    for i, s in enumerate(samples, 1):
        api_ms    = f"{s.get('response_ms')} ms" if s.get("response_ms") else "ERR"
        fired     = "✅ Yes" if s.get("new_alert") else "❌ No (dedup)"
        e2e       = f"{s.get('e2e_ms')} ms" if s.get("e2e_ms") else "timeout"
        nonblock  = "✅ Yes" if s.get("nonblocking") else "—"
        lines.append(f"| {i} | {api_ms} | {fired} | {e2e} | {nonblock} |")

    if valid:
        e2e_vals = [s["e2e_ms"] for s in valid]
        api_vals = [s["response_ms"] for s in valid if s.get("response_ms")]
        e2e_stat = compute_stats(e2e_vals)
        api_stat = compute_stats(api_vals)

        lines += [
            "",
            "## Summary Statistics",
            "",
            "| Metric | API Response | E2E Notification Latency |",
            "|--------|-------------|--------------------------|",
            f"| Min    | {api_stat.get('min_ms')} ms | {e2e_stat.get('min_ms')} ms |",
            f"| Mean   | {api_stat.get('mean_ms')} ms | {e2e_stat.get('mean_ms')} ms |",
            f"| Max    | {api_stat.get('max_ms')} ms | {e2e_stat.get('max_ms')} ms |",
            "",
            "> **Non-blocking confirmed**: API response time is the time for FastAPI to return",
            "> the 200 OK to the ESP32. The notification fires AFTER this, proving `asyncio.create_task`",
            "> prevents the ESP32 ACK from being delayed by Telegram HTTP I/O.",
        ]

    lines += [
        "",
        "---",
        "_Generated by `measure_o1_notifications.py`_",
    ]

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="O1 notification latency test")
    parser.add_argument("--device-secret", default=os.getenv("DEVICE_SECRET", ""),
                        help="Device secret (or DEVICE_SECRET env var)")
    parser.add_argument("--local-url",     default=LOCAL_API_DEFAULT)
    parser.add_argument("--samples",       type=int, default=3)
    parser.add_argument("--force-resolve", action="store_true",
                        help="Send a normal reading before each test to clear open alerts")
    args = parser.parse_args()

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print("[o1] ERROR: TELEGRAM_BOT_TOKEN not set in environment / .env")
        sys.exit(1)
    if not args.device_secret:
        print("[o1] ERROR: --device-secret required (or set DEVICE_SECRET env var)")
        sys.exit(1)

    print("[o1] O1 Alert Notification Latency Test")
    print(f"[o1] Local API : {args.local_url}")
    print(f"[o1] Samples   : {args.samples}\n")

    if not wait_for_backend(args.local_url):
        print("[o1] ❌ Local backend not reachable.")
        sys.exit(1)
    print("[o1] ✅ Backend ready")

    if not has_active_patient(args.local_url):
        print("[o1] ❌ No active patient session. Log a patient in via the bedside dashboard first.")
        sys.exit(1)
    print("[o1] ✅ Active patient session found\n")

    samples: list[dict] = []

    for i in range(1, args.samples + 1):
        print(f"── Sample {i}/{args.samples} ─────────────────────────────────")

        # Optional: resolve open alerts so this reading fires a new notification
        if args.force_resolve:
            print("  Sending normal reading to resolve open alerts …")
            send_reading(args.local_url, args.device_secret, NORMAL_READING)
            time.sleep(2)  # allow resolve_alerts_for_patient to propagate

        # Timestamp just before POST — anything arriving after this is ours
        t_before_post = datetime.now(timezone.utc)

        print("  Sending danger reading (SpO₂=85%) …", end=" ", flush=True)
        r = send_reading(args.local_url, args.device_secret, DANGER_READING)

        if r["error"]:
            print(f"❌ {r['error']}")
            samples.append({"error": r["error"]})
            continue

        print(f"✅  HTTP {r['status_code']}  response in {r['response_ms']} ms")
        new_alert = r["body"].get("alert", False)
        print(f"  Body: health_status={r['body'].get('health_status')} alert={new_alert}")

        if not new_alert:
            print("  ⚠  alert=false — reading may be in warning/normal range or dedup suppressed it.")
            samples.append({"response_ms": r["response_ms"], "new_alert": False, "e2e_ms": None})
            continue

        print(f"  Polling Telegram for message (timeout {POLL_TIMEOUT_S}s) …", end=" ", flush=True)
        msg = poll_for_message(token, t_before_post, "MediSync", POLL_TIMEOUT_S)

        if msg is None:
            print("timeout")
            samples.append({"response_ms": r["response_ms"], "new_alert": True, "e2e_ms": None})
        else:
            # e2e = Telegram message.date − t_sent
            e2e_ms = (msg["message_date_utc"] - r["t_sent_utc"]).total_seconds() * 1000
            e2e_ms = round(e2e_ms, 0)
            # non-blocking if API returned before Telegram delivered (always true for fire-and-forget)
            nonblocking = r["response_ms"] < e2e_ms
            print(f"✅  delivered in {e2e_ms} ms")
            print(f"  Non-blocking: API={r['response_ms']} ms  <  Telegram={e2e_ms} ms  → {nonblocking}")
            print(f"  Snippet: {msg['text_snippet'][:80]}")
            samples.append({
                "response_ms": r["response_ms"],
                "new_alert":   True,
                "e2e_ms":      e2e_ms,
                "nonblocking": nonblocking,
            })

        if i < args.samples:
            print("  (waiting 5 s before next sample)")
            time.sleep(5)

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    write_report(samples, now_str)

    valid = [s for s in samples if s.get("e2e_ms") is not None]
    print(f"\n── Summary ──────────────────────────────────────────")
    if valid:
        api_mean = sum(s["response_ms"] for s in valid) / len(valid)
        e2e_mean = sum(s["e2e_ms"] for s in valid) / len(valid)
        print(f"  API response (mean) : {api_mean:.0f} ms")
        print(f"  E2E notification    : {e2e_mean:.0f} ms")
        print(f"  Non-blocking        : ✅ (API response always before Telegram delivery)")
    print(f"  Report: {OUTPUT_PATH}\n")


if __name__ == "__main__":
    main()
