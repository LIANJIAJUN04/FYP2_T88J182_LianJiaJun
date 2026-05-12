#include <ArduinoJson.h>
#include <math.h>
#include "config.h"
#include "sensors.h"

// ── LED helpers ───────────────────────────────────────────────────────────────
static void ledOk() {
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED,   LOW);
}

static void ledError() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED,   HIGH);
}

// ── Serial transmit ───────────────────────────────────────────────────────────
static void sendReading(float spo2, int bpm, float temperature) {
  StaticJsonDocument<200> doc;
  doc["spo2"]        = spo2;
  doc["bpm"]         = bpm;
  doc["temperature"] = temperature;
  doc["timestamp"]   = millis() / 1000;

  serializeJson(doc, Serial);
  Serial.println(); // newline terminates the JSON line
}

// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(BAUD_RATE);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED,   OUTPUT);
  ledError(); // red while initialising

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!sensorsBegin()) {
    Serial.println("[setup] Sensor init failed — halting");
    while (true) {
      ledError();
      delay(500);
      digitalWrite(LED_RED, LOW);
      delay(500);
    }
  }

  ledOk();
  Serial.println("[setup] Ready");
}

void loop() {
  unsigned long start = millis();

  sensorsUpdate(); // slides buffer and recalculates SpO2 + BPM (~1 s)

  float spo2        = readSpO2();
  int   bpm         = readBPM();
  float temperature = readTemperature();

  if (spo2 < 0 || bpm < 0) {
    Serial.printf("[loop] Invalid reading (spo2=%.1f bpm=%d temp=%.2f) — skipping\n",
                  spo2, bpm, temperature);
    ledError();
    return;
  }

  if (isnan(temperature)) temperature = 0.0f;

  sendReading(spo2, bpm, temperature);
  ledOk();

  long elapsed = (long)(millis() - start);
  if (elapsed < POST_INTERVAL_MS) {
    delay(POST_INTERVAL_MS - elapsed);
  }
}
