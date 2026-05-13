#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <Adafruit_MLX90614.h>

// ======================================================
// SENSORS
// ======================================================
MAX30105 particleSensor;
Adafruit_MLX90614 mlx = Adafruit_MLX90614();

// ======================================================
// HEART RATE VARIABLES
// ======================================================
const byte RATE_SIZE = 4;

byte rates[RATE_SIZE];
byte rateSpot = 0;
byte beatCount = 0;

long lastBeat = 0;

float beatsPerMinute;
int beatAvg = 0;

// ======================================================
// TEMPERATURE
// ======================================================
float bodyTemp = 0;

// ======================================================
// TIMERS
// ======================================================
unsigned long lastJson = 0;
unsigned long lastTempRead = 0;

// ======================================================
// SETUP
// ======================================================
void setup()
{
  Serial.begin(115200);

  Wire.begin(21, 22);

  // ======================================================
  // MAX30102 INIT
  // ======================================================
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD))
  {
    while (1);
  }

  particleSensor.setup(
    20,
    4,
    2,
    100,
    411,
    2048
  );

  particleSensor.setPulseAmplitudeGreen(0);

  // ======================================================
  // MLX90614 INIT
  // ======================================================
  mlx.begin();
}

// ======================================================
// LOOP
// ======================================================
void loop()
{
  // ======================================================
  // READ IR ONLY
  // ======================================================
  long irValue = particleSensor.getIR();

  // ======================================================
  // HEARTBEAT DETECTION
  // ======================================================
  if (checkForBeat(irValue))
  {
    long delta = millis() - lastBeat;
    lastBeat = millis();

    beatsPerMinute = 60.0 / (delta / 1000.0);

    // VALID BPM ONLY
    if (beatsPerMinute > 50 && beatsPerMinute < 120)
    {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;

      if (beatCount < RATE_SIZE)
      {
        beatCount++;
      }

      beatAvg = 0;

      for (byte i = 0; i < beatCount; i++)
      {
        beatAvg += rates[i];
      }

      beatAvg /= beatCount;
    }
  }

  // ======================================================
  // TEMPERATURE ONLY EVERY 2 SECONDS
  // ======================================================
  if (millis() - lastTempRead > 2000)
  {
    lastTempRead = millis();

    bodyTemp = mlx.readObjectTempC();
  }

  // ======================================================
  // JSON OUTPUT
  // ======================================================
  if (millis() - lastJson > 2000)
  {
    lastJson = millis();

    Serial.print("{\"bpm\":");
    Serial.print(beatAvg);

    Serial.print(",\"temperature\":");
    Serial.print(bodyTemp, 1);

    Serial.print(",\"timestamp\":");
    Serial.print(millis() / 1000);

    Serial.println("}");
  }
}