"""
serial_bridge.py

Reads JSON lines from the ESP32 over USB serial and forwards each reading
to the local FastAPI backend at localhost:8000.

Disconnect detection (two layers):
  1. SerialException  — USB cable pulled, device reset, or OS revoked the port.
     The bridge immediately POSTs /api/device/disconnect so the session closes
     with accurate timestamps rather than waiting for the 5-min watchdog.
  2. Idle timeout     — No data (including no-finger status lines) received for
     IDLE_TIMEOUT_S seconds.  Treats total serial silence as a hard disconnect.
     Notified once per offline event; resets when the device starts talking again.

Usage:
    pip install pyserial requests
    python serial_bridge.py

Set SERIAL_PORT to match your system:
    Linux:   /dev/ttyUSB0  or  /dev/ttyACM0
    Mac:     /dev/cu.usbserial-*
    Windows: COM3  (check Device Manager)
"""

import json
import sys
import time

import requests
import serial
import serial.tools.list_ports

BAUD_RATE       = 115200
API_URL         = "http://localhost:8000/api/readings"
DISCONNECT_URL  = "http://localhost:8000/api/device/disconnect"
DEVICE_SECRET   = "esp32"
DEVICE_ID       = "esp32-001"
TIMEOUT_S       = 2
IDLE_TIMEOUT_S  = 30   # seconds of total silence before flagging as disconnected

# USB serial chips used by ESP32 dev boards
ESP32_USB_IDS = [
    (0x10C4, 0xEA60),  # Silicon Labs CP2102/CP2109
    (0x1A86, 0x7523),  # CH340
    (0x1A86, 0x55D4),  # CH9102
    (0x0403, 0x6001),  # FTDI FT232R
]


def find_port() -> str:
    """Auto-detect the ESP32 serial port by USB vendor/product ID."""
    ports = serial.tools.list_ports.comports()

    # Prefer a port whose VID/PID matches a known ESP32 USB chip
    for p in ports:
        if (p.vid, p.pid) in ESP32_USB_IDS:
            print(f"[bridge] Auto-detected ESP32 on {p.device} ({p.description})")
            return p.device

    # Fall back to the first ttyUSB* port
    usb_ports = [p.device for p in ports if "ttyUSB" in p.device or "ttyACM" in p.device]
    if usb_ports:
        print(f"[bridge] Using first USB serial port: {usb_ports[0]}")
        return usb_ports[0]

    all_ports = [p.device for p in ports]
    print(f"[bridge] No ESP32 found. Available ports: {all_ports or 'none'}")
    print("[bridge] Plug in the ESP32 and retry.")
    sys.exit(1)


def post_reading(payload: dict) -> bool:
    try:
        r = requests.post(
            API_URL,
            json=payload,
            headers={
                "X-Device-Secret": DEVICE_SECRET,
                "X-Device-Id":     DEVICE_ID,
            },
            timeout=TIMEOUT_S,
        )
        ok = 200 <= r.status_code < 300
        status = r.json().get("health_status", "?") if ok else r.status_code
        print(f"[bridge] {'ok' if ok else 'err'} ({status}) | "
              f"SpO2={payload.get('spo2')} BPM={payload.get('bpm')} Temp={payload.get('temperature')}")
        return ok
    except requests.exceptions.ConnectionError:
        print("[bridge] Cannot reach local backend — is it running?")
        return False
    except Exception as e:
        print(f"[bridge] POST error: {e}")
        return False


def notify_disconnect() -> None:
    """Tell FastAPI to close the active session immediately."""
    try:
        requests.post(DISCONNECT_URL, timeout=TIMEOUT_S)
        print("[bridge] Disconnect notified — session closed by backend")
    except Exception as e:
        print(f"[bridge] Could not reach backend for disconnect: {e}")


def main():
    port = find_port()
    print(f"[bridge] Opening {port} at {BAUD_RATE} baud")

    with serial.Serial(port, BAUD_RATE, timeout=2, dsrdtr=False, rtscts=False) as ser:
        # Disable DTR so opening the port doesn't reset the ESP32
        ser.dtr = False
        ser.rts = False
        # Flush any boot ROM / stale bytes already in the buffer
        time.sleep(0.5)
        ser.reset_input_buffer()
        print(f"[bridge] Listening — forwarding to {API_URL}")

        last_data_at   = time.monotonic()   # timestamp of last received byte
        device_offline = False              # True while we believe device is gone

        while True:
            # ── Read one line ──────────────────────────────────────────────
            try:
                raw = ser.readline().decode("utf-8", errors="ignore").strip()
            except serial.SerialException as e:
                # USB unplugged or OS revoked the port
                print(f"[bridge] Serial disconnected: {e}")
                if not device_offline:
                    device_offline = True
                    notify_disconnect()
                time.sleep(2)
                continue

            # ── Check idle timeout ─────────────────────────────────────────
            # readline() returns "" after its 2-s timeout when the port is
            # open but the device is silent (e.g. firmware crashed, battery
            # dead while USB is still physically connected).
            if raw:
                last_data_at = time.monotonic()
                if device_offline:
                    print("[bridge] Device back online")
                    device_offline = False
            else:
                idle = time.monotonic() - last_data_at
                if idle > IDLE_TIMEOUT_S and not device_offline:
                    print(f"[bridge] No data for {idle:.0f}s — flagging as disconnected")
                    device_offline = True
                    notify_disconnect()
                continue  # empty line — nothing to forward

            # ── Skip ESP32 debug lines ─────────────────────────────────────
            if raw.startswith("["):
                print(f"[esp32] {raw}")
                continue

            # ── Parse and forward ──────────────────────────────────────────
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                print(f"[bridge] Non-JSON line: {raw!r}")
                continue

            post_reading(payload)


if __name__ == "__main__":
    main()
