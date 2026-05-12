#pragma once

// ── WiFi ─────────────────────────────────────────────────────────────────────
#define WIFI_SSID     "LIAN"
#define WIFI_PASSWORD "Jacky_04"

// ── Backend ───────────────────────────────────────────────────────────────────
// Set to the bedside machine's LAN IP (run `ipconfig` / `ip a` to find it)
#define API_URL       "http://10.235.22.181:8000"
#define DEVICE_ID     "esp32-001"
#define DEVICE_SECRET "esp32"

// ── I2C pins (ESP32 default) ──────────────────────────────────────────────────
#define SDA_PIN 21
#define SCL_PIN 22

// ── LED pins ──────────────────────────────────────────────────────────────────
// Wire a green LED (+ 220Ω) to GPIO 25, red LED (+ 220Ω) to GPIO 26
#define LED_GREEN 25
#define LED_RED   26

// ── Timing ────────────────────────────────────────────────────────────────────
#define POST_INTERVAL_MS  1000   // POST every 1 second
#define RETRY_COUNT       3      // Retry on HTTP failure
#define RETRY_DELAY_MS    500
