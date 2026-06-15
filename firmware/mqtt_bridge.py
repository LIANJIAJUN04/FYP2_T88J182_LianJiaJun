"""
mqtt_bridge.py  —  Phase 8 WiFi transport

Bridges the Mosquitto MQTT broker to the local FastAPI backend.

Topics
------
  medisync/readings  — ESP32 publishes one JSON reading per second
  medisync/status    — Last Will and Testament topic; broker publishes
                       {"status": "offline"} automatically if the ESP32
                       drops its connection without a clean DISCONNECT

LWT flow
--------
  1. ESP32 connects with willTopic="medisync/status",
     willMessage={"status":"offline"}, willRetain=true, willQos=1.
  2. While alive the ESP32 publishes to medisync/readings every 1 s.
  3. On abrupt power-loss or WiFi drop the broker detects the keepalive
     timeout (≤ 15 s) and broadcasts the LWT to medisync/status.
  4. This bridge receives the LWT, immediately POSTs /api/device/disconnect,
     and FastAPI closes the active session with accurate timestamps.

Retained LWT guard
------------------
  The offline LWT is published with retain=true so a reconnecting bridge
  still sees it even if it missed the live event.  On startup the broker
  replays ALL retained messages to new subscribers.  msg.retain == 1 means
  the message was stored before this bridge session started — it is stale
  and must NOT trigger a disconnect.  Only a live (non-retained) offline
  message means the ESP32 just went down.

The FastAPI heartbeat watchdog (_heartbeat_watchdog in main.py) is still
running as a secondary safety-net for edge cases where this bridge process
itself crashes before it can forward the LWT.

Usage
-----
    pip install paho-mqtt requests
    python firmware/mqtt_bridge.py

Edit the constants below to match your local network and env vars.
"""

import json
import os
import sys
import threading
from datetime import datetime, timezone

import requests
import paho.mqtt.client as mqtt

# ── Configuration ─────────────────────────────────────────────────────────────
MQTT_BROKER     = "localhost"           # or bedside machine LAN IP
MQTT_PORT       = 1883
MQTT_KEEPALIVE  = 60                    # seconds; broker detects drop at ~1.5×

TOPIC_READINGS  = "medisync/readings"
TOPIC_STATUS    = "medisync/status"     # LWT topic

API_URL         = "http://localhost:8000/api/readings"
DISCONNECT_URL  = "http://localhost:8000/api/device/disconnect"
DEVICE_SECRET   = "esp32"
DEVICE_ID       = "esp32-001"
REQUEST_TIMEOUT = 5

# How long to wait after an LWT before closing the session.
# A brief WiFi blip causes the ESP32 to reconnect in <20 s — any reading
# arriving in this window cancels the timer and the session stays open.
# Only a true power-off produces no readings for the full grace period.
LWT_GRACE_SECONDS = 22


# ── LWT grace-period timer ────────────────────────────────────────────────────

_lwt_timer: threading.Timer | None = None
_lwt_lock = threading.Lock()


def _fire_disconnect() -> None:
    """Grace period expired with no reading — treat as a real disconnect."""
    global _lwt_timer
    with _lwt_lock:
        _lwt_timer = None
    print(f"[bridge] Grace period elapsed — no reconnect detected, closing session")
    notify_disconnect()


def _schedule_lwt_disconnect() -> None:
    """Start (or restart) the disconnect timer after receiving an LWT."""
    global _lwt_timer
    with _lwt_lock:
        if _lwt_timer is not None:
            _lwt_timer.cancel()
        _lwt_timer = threading.Timer(LWT_GRACE_SECONDS, _fire_disconnect)
        _lwt_timer.daemon = True
        _lwt_timer.start()
    print(
        f"[bridge] LWT: ESP32 offline — waiting {LWT_GRACE_SECONDS}s "
        f"for reconnect before closing session"
    )


def _cancel_lwt_timer(reason: str = "reconnect") -> None:
    """Cancel the pending timer — ESP32 came back online."""
    global _lwt_timer
    with _lwt_lock:
        if _lwt_timer is None:
            return
        _lwt_timer.cancel()
        _lwt_timer = None
    print(f"[bridge] LWT grace period cancelled ({reason}) — session kept open")


# ── Helpers ───────────────────────────────────────────────────────────────────

def post_reading(payload: dict) -> None:
    # A reading arriving means the ESP32 is live — cancel any pending LWT timer.
    _cancel_lwt_timer("reading received")
    try:
        r = requests.post(
            API_URL,
            json=payload,
            headers={
                "X-Device-Secret": DEVICE_SECRET,
                "X-Device-Id":     DEVICE_ID,
            },
            timeout=REQUEST_TIMEOUT,
        )
        ok = 200 <= r.status_code < 300
        label  = r.json().get("health_status", "?") if ok else r.status_code
        symbol = "ok" if ok else "err"
        print(
            f"[bridge] {symbol} ({label}) | "
            f"SpO2={payload.get('spo2')} "
            f"BPM={payload.get('bpm')} "
            f"Temp={payload.get('temperature')}"
        )
    except Exception as e:
        print(f"[bridge] POST /api/readings error: {e}")


def notify_disconnect() -> None:
    """Tell FastAPI to close the active session immediately."""
    try:
        requests.post(DISCONNECT_URL, timeout=REQUEST_TIMEOUT)
        print("[bridge] LWT received — disconnect notified, session closed")
    except Exception as e:
        print(f"[bridge] Could not reach backend for disconnect: {e}")


# ── MQTT callbacks (paho-mqtt v2 API) ─────────────────────────────────────────

def on_connect(client, userdata, connect_flags, reason_code, properties) -> None:
    if reason_code != 0:
        print(f"[bridge] Broker connection refused — rc={reason_code}")
        os._exit(1)  # os._exit terminates all threads; sys.exit only kills the callback thread
    print(f"[bridge] Connected to {MQTT_BROKER}:{MQTT_PORT}")
    client.subscribe(TOPIC_READINGS, qos=1)
    client.subscribe(TOPIC_STATUS,   qos=1)
    print(f"[bridge] Subscribed to {TOPIC_READINGS} and {TOPIC_STATUS}")


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties) -> None:
    if reason_code != 0:
        print(f"[bridge] Unexpected broker disconnect — rc={reason_code}, will auto-reconnect")


def on_message(client, userdata, msg: mqtt.MQTTMessage) -> None:
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"[bridge] Non-JSON on {msg.topic}: {msg.payload!r}")
        return

    if msg.topic == TOPIC_STATUS:
        if payload.get("status") == "offline":
            if msg.retain:
                # Stale retained message from a previous disconnect — ignore.
                print("[bridge] Stale retained LWT ignored (device reconnecting…)")
            else:
                _schedule_lwt_disconnect()
        elif payload.get("status") == "online":
            print("[bridge] ESP32 online")
            _cancel_lwt_timer("online status received")
        return

    if msg.topic == TOPIC_READINGS:
        payload["bridge_ts"] = datetime.now(timezone.utc).isoformat()
        post_reading(payload)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="medisync-bridge",
        clean_session=True,
    )
    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.on_message    = on_message

    print(f"[bridge] Connecting to broker at {MQTT_BROKER}:{MQTT_PORT} …")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=MQTT_KEEPALIVE)

    # loop_forever() handles reconnection automatically on network blips
    client.loop_forever()


if __name__ == "__main__":
    main()
