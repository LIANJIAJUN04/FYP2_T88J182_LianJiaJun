#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <Adafruit_MLX90614.h>
#include "soc/rtc_cntl_reg.h"
#include "config.h"

// ── Sensors ───────────────────────────────────────────────────────────────────
MAX30105          particleSensor;
Adafruit_MLX90614 mlx = Adafruit_MLX90614();

// ── Heart rate ────────────────────────────────────────────────────────────────
const byte RATE_SIZE = 4;
byte  rates[RATE_SIZE];
byte  rateSpot   = 0;
byte  beatCount  = 0;
long  lastBeat   = 0;
float beatsPerMinute = 0;
int   beatAvg    = 0;

// ── Vitals ────────────────────────────────────────────────────────────────────
float bodyTemp = 0;
float spo2     = 98.5;

// ── Timers ────────────────────────────────────────────────────────────────────
unsigned long lastPublish    = 0;
unsigned long lastTempRead   = 0;
unsigned long lastSpo2Update = 0;

// ── WiFi + MQTT ───────────────────────────────────────────────────────────────
WiFiClient   espClient;
PubSubClient mqttClient(espClient);

// ── LED helpers ───────────────────────────────────────────────────────────────
static void ledInit() {
#if LED_GREEN >= 0
  pinMode(LED_GREEN, OUTPUT);
  digitalWrite(LED_GREEN, LOW);
#endif
#if LED_RED >= 0
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_RED, LOW);
#endif
}

// ok=true → green on, red off.  ok=false → green off, red on.
static void ledSet(bool ok) {
#if LED_GREEN >= 0
  digitalWrite(LED_GREEN, ok ? HIGH : LOW);
#endif
#if LED_RED >= 0
  digitalWrite(LED_RED, ok ? LOW : HIGH);
#endif
}

// ── WiFi connection ───────────────────────────────────────────────────────────
static void connectWiFi() {
  ledSet(false);
  Serial.printf("[wifi] Connecting to %s", WIFI_SSID);

  WiFi.persistent(false);       // don't write credentials to flash on every connect
  WiFi.setAutoReconnect(true);  // hardware-level reconnect on brief AP drops
  WiFi.setSleep(false);         // disable modem sleep — prevents dropped MQTT keepalives
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t0 > 20000) {
      Serial.println("\n[wifi] Timeout — restarting");
      ESP.restart();
    }
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] Connected  IP=%s\n", WiFi.localIP().toString().c_str());
}

// ── MQTT connection with LWT ──────────────────────────────────────────────────
static void connectMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  // Critical: short keepalive so the broker fires the LWT within ~22 s of
  // abrupt power loss (1.5 × 15 s).  PubSubClient default = 60 s → ~90 s LWT
  // latency, which leaves the session row frozen in the admin UI far too long.
  mqttClient.setKeepAlive(MQTT_KEEPALIVE_S);

  // LWT payload must match exactly what mqtt_bridge.py checks:
  //   if payload.get("status") == "offline": notify_disconnect()
  const char* lwtPayload =
    "{\"status\":\"offline\",\"device_id\":\"" DEVICE_ID "\"}";

  while (!mqttClient.connected()) {
    ledSet(false);
    Serial.print("[mqtt] Connecting to broker...");

    bool ok = mqttClient.connect(
      DEVICE_ID,      // clientId — must be unique per broker
      nullptr,        // username  (anonymous broker)
      nullptr,        // password
      MQTT_STATUS,    // willTopic
      1,              // willQos  — QoS 1: at-least-once; survives brief broker restart
      true,           // willRetain — bridge receives it even if it connects after the event
      lwtPayload
    );

    if (ok) {
      Serial.println("ok");
      // Overwrite any retained "offline" message so a reconnected bridge knows
      // we are live again.
      mqttClient.publish(
        MQTT_STATUS,
        "{\"status\":\"online\",\"device_id\":\"" DEVICE_ID "\"}",
        true  // retain
      );
    } else {
      Serial.printf("failed rc=%d, retry in 5 s\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  // Powerbank supply can sag during WiFi connect burst — disable brownout reset
  // so the chip survives the voltage dip instead of restarting in a loop.
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  ledInit();
  ledSet(false);  // red on during init

  Wire.begin(21, 22);
  randomSeed(analogRead(0));

  // MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("[sensor] MAX30102 not found — check wiring");
    while (1) { ledSet(false); delay(500); }  // halt with red
  }
  particleSensor.setup(20, 4, 2, 100, 411, 2048);
  particleSensor.setPulseAmplitudeGreen(0);

  // MLX90614
  if (!mlx.begin()) {
    Serial.println("[sensor] MLX90614 not found — check wiring");
    while (1) { ledSet(false); delay(500); }  // halt with red
  }

  connectWiFi();
  connectMQTT();
  ledSet(true);   // green — fully connected
  Serial.println("[init] Ready — publishing to " MQTT_TOPIC);
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  // Maintain connections — reconnect transparently on drop
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] Lost connection — reconnecting");
    ledSet(false);
    connectWiFi();
    connectMQTT();
    ledSet(true);
  }
  if (!mqttClient.connected()) {
    Serial.println("[mqtt] Lost connection — reconnecting");
    ledSet(false);
    connectMQTT();
    ledSet(true);
  }
  mqttClient.loop();  // keep-alive ping + incoming message processing

  // ── Read IR ───────────────────────────────────────────────────────────────
  long irValue = particleSensor.getIR();

  if (irValue < 70000) {
    // No finger on sensor — skip this cycle; do not publish stale data
    beatAvg = 0;
    delay(200);
    return;
  }

  // ── Heart rate detection ──────────────────────────────────────────────────
  if (checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60.0 / (delta / 1000.0);

    if (beatsPerMinute > 50 && beatsPerMinute < 120) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
      if (beatCount < RATE_SIZE) beatCount++;

      beatAvg = 0;
      for (byte i = 0; i < beatCount; i++) beatAvg += rates[i];
      beatAvg /= beatCount;
    }
  }

  // ── SpO₂ (BPM-correlated simulation every 3 s) ────────────────────────────
  if (millis() - lastSpo2Update > 3000) {
    lastSpo2Update = millis();

    float target;
    if      (beatAvg > 105) target = 96.8;
    else if (beatAvg > 90)  target = 97.5;
    else if (beatAvg > 75)  target = 98.2;
    else                    target = 98.8;

    target += random(-4, 5) / 10.0;
    target  = constrain(target, 95.5, 99.8);
    spo2    = (spo2 * 0.7) + (target * 0.3);  // low-pass smooth
  }

  // ── Temperature every 2 s ─────────────────────────────────────────────────
  if (millis() - lastTempRead > 2000) {
    lastTempRead = millis();
    bodyTemp = mlx.readObjectTempC();
  }

  // ── Publish to MQTT every 1 s (only when BPM is detected) ───────────────
  // device_id and device_secret are embedded here because MQTT has no HTTP
  // headers.  The bridge extracts them for the X-Device-Secret auth header
  // on the POST /api/readings call to FastAPI.
  if (millis() - lastPublish > 1000 && beatAvg > 0) {
    lastPublish = millis();

    StaticJsonDocument<192> doc;
    doc["spo2"]          = round(spo2 * 10) / 10.0;
    doc["bpm"]           = beatAvg;
    doc["temperature"]   = round(bodyTemp * 10) / 10.0;
    doc["timestamp"]     = millis() / 1000;
    doc["device_id"]     = DEVICE_ID;
    doc["device_secret"] = DEVICE_SECRET;

    char buf[192];
    size_t n = serializeJson(doc, buf);

    Serial.println(buf);  // print JSON to Serial Monitor when BPM is detected

    if (!mqttClient.publish(MQTT_TOPIC, (uint8_t*)buf, n, false)) {
      Serial.println("[mqtt] publish failed");
      ledSet(false);
    }
  }
}
