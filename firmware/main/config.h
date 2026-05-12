#pragma once

// ── Serial ────────────────────────────────────────────────────────────────────
#define BAUD_RATE     115200

// ── I2C pins (ESP32 default) ──────────────────────────────────────────────────
#define SDA_PIN 21
#define SCL_PIN 22

// ── LED pins ──────────────────────────────────────────────────────────────────
// Wire a green LED (+ 220Ω) to GPIO 25, red LED (+ 220Ω) to GPIO 26
#define LED_GREEN 25
#define LED_RED   26

// ── Timing ────────────────────────────────────────────────────────────────────
#define POST_INTERVAL_MS  1000   // transmit every 1 second
