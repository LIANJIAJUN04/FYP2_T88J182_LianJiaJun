# Firmware

ESP32 firmware and bedside serial bridge for MediSync.

## Hardware

| Sensor | Protocol | I2C Address |
|---|---|---|
| MAX30102 (SpO₂ + BPM) | I2C | 0x57 |
| MLX90614ESF (Temperature) | I2C | 0x5A |

## Sketches

| Sketch | Purpose |
|---|---|
| `main/` | Production — reads sensors every 1 s, outputs JSON over USB Serial, LED status |
| `i2c_scan/` | Utility — scan I2C bus to verify sensor addresses before flashing main |

## Wiring (ESP32 DevKit)

| Signal | ESP32 Pin |
|---|---|
| SDA | GPIO 21 |
| SCL | GPIO 22 |
| LED Green | GPIO 25 |
| LED Red | GPIO 26 |

## Flashing

1. Open `main/main.ino` in Arduino IDE (or PlatformIO)
2. Install libraries: `ArduinoJson`, `SparkFun MAX3010x Sensor Library`, `Adafruit MLX90614`
3. Select board: **ESP32 Dev Module**, correct COM port
4. Flash and open Serial Monitor at **115200 baud** to verify JSON output

## Serial Output Format

One JSON object per second over USB at 115200 baud:

```json
{"spo2": 97.5, "bpm": 72, "temperature": 36.6}
```

## Serial Bridge

`serial_bridge.py` runs on the bedside machine — it auto-detects the ESP32 USB port (CP2102 / CH340 / CH9102 / FTDI) and POSTs each reading to the local FastAPI backend.

```bash
pip install pyserial requests
python serial_bridge.py
```

Edit the constants at the top of the script if you need to change the baud rate, API URL, or device secret.
