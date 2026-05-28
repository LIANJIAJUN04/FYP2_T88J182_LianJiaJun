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
import sys

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
REQUEST_TIMEOUT = 2


# ── Helpers ───────────────────────────────────────────────────────────────────

def post_reading(payload: dict) -> None:
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


# ── MQTT callbacks ────────────────────────────────────────────────────────────

def on_connect(client: mqtt.Client, userdata, flags, rc: int) -> None:
    if rc != 0:
        print(f"[bridge] Broker connection refused — rc={rc}")
        sys.exit(1)
    print(f"[bridge] Connected to {MQTT_BROKER}:{MQTT_PORT}")
    client.subscribe(TOPIC_READINGS, qos=1)
    client.subscribe(TOPIC_STATUS,   qos=1)
    print(f"[bridge] Subscribed to {TOPIC_READINGS} and {TOPIC_STATUS}")


def on_disconnect(client: mqtt.Client, userdata, rc: int) -> None:
    if rc != 0:
        print(f"[bridge] Unexpected broker disconnect — rc={rc}, will auto-reconnect")


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"[bridge] Non-JSON on {msg.topic}: {msg.payload!r}")
        return

    if msg.topic == TOPIC_STATUS:
        # LWT published by broker when ESP32 disappears
        if payload.get("status") == "offline":
            print("[bridge] LWT: ESP32 went offline")
            notify_disconnect()
        return

    if msg.topic == TOPIC_READINGS:
        post_reading(payload)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    client = mqtt.Client(client_id="medisync-bridge", clean_session=True)
    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.on_message    = on_message

    print(f"[bridge] Connecting to broker at {MQTT_BROKER}:{MQTT_PORT} …")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=MQTT_KEEPALIVE)

    # loop_forever() handles reconnection automatically on network blips
    client.loop_forever()


if __name__ == "__main__":
    main()
