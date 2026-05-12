#pragma once

#include <Wire.h>
#include <math.h>
#include "MAX30105.h"          // SparkFun MAX3010x library
#include "spo2_algorithm.h"    // Bundled with SparkFun MAX3010x
#include <Adafruit_MLX90614.h> // Adafruit MLX90614 library

// ── MAX30102 ──────────────────────────────────────────────────────────────────
static MAX30105 particleSensor;

// Rolling sample buffers (100 samples at 25 Hz ≈ 4 s window; refreshed 25/s)
static uint32_t irBuffer[100];
static uint32_t redBuffer[100];
static const int32_t BUFFER_LEN = 100;
static const int32_t REFRESH    = 25;  // new samples collected per loop tick

static int32_t  spo2Val       = 0;
static int8_t   spo2Valid     = 0;
static int32_t  heartRateVal  = 0;
static int8_t   heartRateValid = 0;

// ── MLX90614ESF ───────────────────────────────────────────────────────────────
static Adafruit_MLX90614 mlx;

// ─────────────────────────────────────────────────────────────────────────────

bool sensorsBegin() {
  // MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[sensors] MAX30102 not found");
    return false;
  }
  particleSensor.setup(
    60,   // LED brightness (0–255)
    4,    // sample average (1, 2, 4, 8, 16, 32)
    2,    // LED mode: 1=red only, 2=red+IR, 3=red+IR+green
    100,  // sample rate (Hz)
    411,  // pulse width (μs) — affects resolution
    4096  // ADC range
  );

  // MLX90614 — needs ~500 ms to stabilise after begin() before reads are valid
  if (!mlx.begin()) {
    Serial.println("[sensors] MLX90614 not found");
    return false;
  }
  delay(500);

  // Pre-fill the entire buffer before entering the main loop
  for (int i = 0; i < BUFFER_LEN; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_LEN, redBuffer,
    &spo2Val, &spo2Valid, &heartRateVal, &heartRateValid
  );

  Serial.println("[sensors] MAX30102 + MLX90614 ready");
  return true;
}

// Call once per loop tick. Slides the buffer by REFRESH samples and
// recalculates SpO₂ + BPM — takes ~1 s at 25 Hz sample rate.
void sensorsUpdate() {
  // Discard oldest REFRESH samples, shift remaining to front
  for (int i = REFRESH; i < BUFFER_LEN; i++) {
    redBuffer[i - REFRESH] = redBuffer[i];
    irBuffer[i  - REFRESH] = irBuffer[i];
  }
  // Collect REFRESH new samples
  for (int i = BUFFER_LEN - REFRESH; i < BUFFER_LEN; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_LEN, redBuffer,
    &spo2Val, &spo2Valid, &heartRateVal, &heartRateValid
  );
}

// Returns SpO₂ % (95–100 normal). Returns -1 if sensor signal is invalid
// (finger not placed or too much motion).
float readSpO2() {
  if (!spo2Valid) return -1.0f;
  return (float)spo2Val;
}

// Returns BPM (60–100 normal). Returns -1 if signal is invalid.
int readBPM() {
  if (!heartRateValid) return -1;
  return (int)heartRateVal;
}

// Returns object (skin-surface) temperature in °C from MLX90614.
// Retries up to 3 times — readObjectTempC() can return NaN on a transient
// I2C read error even when the device is addressable.
float readTemperature() {
  for (int i = 0; i < 3; i++) {
    float t = mlx.readObjectTempC();
    if (!isnan(t)) return t;
    delay(20);
  }
  return NAN;
}
