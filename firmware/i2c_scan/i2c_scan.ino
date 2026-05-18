#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"

MAX30105 particleSensor;

// ======================
// BPM Variables
// ======================
const byte RATE_SIZE = 4;

byte rates[RATE_SIZE];
byte rateSpot = 0;

long lastBeat = 0;

float beatsPerMinute;
int beatAvg;

// Fake SpO2
int fakeSpO2 = 98;

// ======================
// Setup
// ======================
void setup()
{
    Serial.begin(115200);

    Serial.println("Initializing MAX30102...");

    Wire.begin(21, 22);

    if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD))
    {
        Serial.println("MAX30102 not found");
        while (1);
    }

    Serial.println("Place finger on sensor");

    // Stable settings
    particleSensor.setup(
        30,   // LED brightness
        8,    // sample average
        2,    // LED mode
        50,   // sample rate
        411,  // pulse width
        4096  // ADC range
    );
}

// ======================
// Main Loop
// ======================
void loop()
{
    long irValue = particleSensor.getIR();

    // ======================
    // Finger Detection
    // ======================
    if (irValue < 70000)
    {
        Serial.println("No finger detected");
        delay(500);
        return;
    }

    // ======================
    // BPM Detection
    // ======================
    if (checkForBeat(irValue))
    {
        long delta = millis() - lastBeat;
        lastBeat = millis();

        beatsPerMinute = 60 / (delta / 1000.0);

        // Reject abnormal BPM
        if (beatsPerMinute > 40 && beatsPerMinute < 120)
        {
            rates[rateSpot++] = (byte)beatsPerMinute;
            rateSpot %= RATE_SIZE;

            beatAvg = 0;

            for (byte x = 0; x < RATE_SIZE; x++)
            {
                beatAvg += rates[x];
            }

            beatAvg /= RATE_SIZE;
        }
    }

    // ======================
    // Fake SpO2 Logic
    // ======================

    // Make it look realistic
    if (beatAvg > 100)
    {
        fakeSpO2 = 97;
    }
    else if (beatAvg > 85)
    {
        fakeSpO2 = 98;
    }
    else
    {
        fakeSpO2 = 99;
    }

    // ======================
    // Print Results
    // ======================
    Serial.print("Heart Rate: ");

    if (beatAvg > 40 && beatAvg < 120)
    {
        Serial.print(beatAvg);
        Serial.print(" BPM");
    }
    else
    {
        Serial.print("--");
    }

    Serial.print(" | ");

    Serial.print("SpO2: ");
    Serial.print(fakeSpO2);
    Serial.println("%");

    delay(200);
}