#include <Wire.h>
#include "config.h"   // SDA_PIN / SCL_PIN

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println("\n[i2c_scan] Scanning bus...");
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[i2c_scan] Found device at 0x%02X", addr);
      if (addr == 0x57) Serial.print("  ← MAX30102 (SpO2/BPM)");
      if (addr == 0x5A) Serial.print("  ← MLX90614 (temperature)");
      Serial.println();
      found++;
    }
  }

  if (found == 0)
    Serial.println("[i2c_scan] No devices found — check wiring");
  else
    Serial.printf("[i2c_scan] Done — %d device(s) found\n", found);
}

void loop() {}
