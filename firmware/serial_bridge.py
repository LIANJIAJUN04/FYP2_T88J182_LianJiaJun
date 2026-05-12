"""
serial_bridge.py

Reads JSON lines from the ESP32 over USB serial and forwards each reading
to the local FastAPI backend at localhost:8000.

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

BAUD_RATE      = 115200
API_URL        = "http://localhost:8000/api/readings"
DEVICE_SECRET  = "esp32"
DEVICE_ID      = "esp32-001"
TIMEOUT_S      = 2

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
    print(f"[bridge] Plug in the ESP32 and retry.")
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
              f"SpO2={payload.get('spo2')} BPM={payload.get('bpm')} "
              f"Temp={payload.get('temperature')}")
        return ok
    except requests.exceptions.ConnectionError:
        print("[bridge] Cannot reach local backend — is it running?")
        return False
    except Exception as e:
        print(f"[bridge] POST error: {e}")
        return False


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
        while True:
            try:
                raw = ser.readline().decode("utf-8", errors="ignore").strip()
            except serial.SerialException as e:
                print(f"[bridge] Serial read error: {e} — retrying in 2s")
                time.sleep(2)
                continue

            if not raw or raw.startswith("["):
                # ESP32 debug lines start with '[' — print and skip
                if raw:
                    print(f"[esp32] {raw}")
                continue

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                print(f"[bridge] Non-JSON line: {raw!r}")
                continue

            post_reading(payload)


if __name__ == "__main__":
    main()
