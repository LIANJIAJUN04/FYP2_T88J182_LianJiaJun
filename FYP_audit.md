# MediSync — Full-Stack Architecture Audit

**Role:** Academic External Examiner & Senior Systems Architect  
**Date:** 2026-05-30  
**Scope:** Actual source code review across all five system layers  
**Purpose:** Identify hidden vulnerabilities, edge cases, and improvements before the FYP viva

---

## How to Read This Document

Each finding is classified as one of two verdicts:

- **In-Code Fix** — Should be resolved before the demo. Examiners can reproduce these with basic testing or by reading both the code and CLAUDE.md side-by-side.
- **Thesis Defense** — Leave the code as-is. Prepare a confident verbal explanation that frames it as a deliberate design decision or a documented limitation. Trying to patch these last-minute introduces more risk than it removes.

At the bottom of this document is a consolidated table and a priority shortlist.

---

## Layer 1 — Firmware (`firmware/main/main.ino`)

---

### 1.1 — SpO₂ Is Simulated and Constrained to 95.5–99.8%: SpO₂ Alerts Can Never Trigger

**Code location:** `main.ino` lines 196–208

```cpp
target += random(-4, 5) / 10.0;
target  = constrain(target, 95.5, 99.8);   // hard floor at 95.5
spo2    = (spo2 * 0.7) + (target * 0.3);
```

The `constrain()` hard-floors SpO₂ at 95.5%. The danger threshold in `status.py` is `spo2 < 90` and the warning threshold is `spo2 < 95`. Both are mathematically unreachable from this generator. No SpO₂ alert will ever fire during any demo or real run.

**Verdict: Thesis Defense**

**Viva preparation:** State it proactively before the examiner finds it. Script:  
*"SpO₂ is simulated because the MAX30102's Ir/Red ratio SpO₂ algorithm requires stable finger contact for 30–60 seconds to produce valid readings. For the prototype demonstration, we generate a BPM-correlated SpO₂ within the normal physiological band, which validates the full data pipeline without requiring continuous perfect sensor contact. The SpO₂ alert thresholds are validated through direct API injection in testing, not through the sensor path — a documented scope limitation in the thesis."*

---

### 1.2 — BPM Detection Window Suppresses the Very Values That Trigger Alerts

**Code location:** `main.ino` lines 184–192

```cpp
if (beatsPerMinute > 50 && beatsPerMinute < 120) {
    rates[rateSpot++] = (byte)beatsPerMinute;
    ...
}
```

The firmware discards instantaneous BPM readings outside 50–120 bpm. The status thresholds declare `danger` for `bpm < 40 or bpm > 130`. A real bradycardia (BPM = 38) or severe tachycardia (BPM = 145) would be silently discarded by the filter. `beatAvg` retains its last valid value — the published BPM looks normal when the patient is not.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The firmware applies a physiological plausibility filter on instantaneous beat-to-beat BPM calculations to suppress motion artifacts — a common requirement with the MAX30102 photodiode. The 50–120 bpm window excludes medically significant extreme values, so extreme-BPM alerting is validated through direct API injection. A production implementation would use the sensor's FIFO-averaged output across more cardiac cycles to maintain sensitivity at extremes without artifact noise."*

---

### 1.3 — CLAUDE.md Claims 3-Attempt Temperature Retry — Code Has Zero

**CLAUDE.md states:** *"Temperature retry — 3 attempts on transient I2C NaN before returning NaN"*

**Actual code (`main.ino` line 213):**
```cpp
if (millis() - lastTempRead > 2000) {
    lastTempRead = millis();
    bodyTemp = mlx.readObjectTempC();   // single read, no retry
}
```

If `readObjectTempC()` returns NaN on a transient I2C glitch, `bodyTemp` becomes NaN. ArduinoJson serialises NaN as JSON `null`. FastAPI's Pydantic model declares `temperature: float` (non-optional), so the bridge receives a 422 validation error and drops that reading silently.

**Verdict: In-Code Fix** (fix the documentation, not the code)

The firmware behaviour is acceptable — one dropped reading per glitch at 1 Hz is negligible. The bug is that CLAUDE.md documents behaviour that does not exist. An examiner who reads both will find the discrepancy immediately. Update CLAUDE.md to accurately state: *"single-attempt read; on NaN, bodyTemp retains its last valid value and the resulting 422 is logged by the bridge as a dropped reading."*

---

### 1.4 — `ESP.restart()` on WiFi Timeout Generates Spurious LWT Events

**Code location:** `main.ino` lines 67–69

```cpp
if (millis() - t0 > 20000) {
    Serial.println("\n[wifi] Timeout — restarting");
    ESP.restart();
```

`ESP.restart()` is an abrupt hardware reset. The TCP connection to Mosquitto drops without a clean MQTT DISCONNECT. The broker fires the LWT (`status: offline`) after the keepalive window (~22 s). The bridge receives this as a live message and starts the 30-second grace timer. If the AP returns and the ESP32 reconnects within 52 seconds (20 + 22 + 30), the next reading cancels the timer — no session closes. This is correct behaviour by design.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The 30-second grace period in the LWT handler was calibrated to absorb the ESP32's 20-second WiFi reconnect timeout and the broker's 22-second LWT window. A transient AP restart of under 52 seconds results in no session closure — the arriving reading cancels the timer. A sustained outage beyond 52 seconds correctly closes the session, as the patient's data cannot be recorded in that window anyway."*

---

### 1.5 — Shared I2C Bus: MAX30102 Physical Removal Can Freeze MLX90614 Reads

The MAX30102 and MLX90614 share the same I2C bus (`Wire.begin(21, 22)`). If the MAX30102 is physically disconnected mid-operation, the I2C bus may be left in a locked state (SDA held low). Subsequent `mlx.readObjectTempC()` calls return NaN or garbage indefinitely until `Wire.end()` + `Wire.begin()` is called.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"Shared I2C bus topology means physical disconnection of one sensor can starve the other through bus lockup. A robust clinical implementation would use a hardware I2C multiplexer (TCA9548A) or independent I2C buses on separate GPIO pin pairs, providing bus isolation between sensors."*

---

## Layer 2 — Network Bridge (`firmware/mqtt_bridge.py`)

---

### 2.1 — `sys.exit(1)` Inside a paho Callback Does Not Terminate the Process

**Code location:** `mqtt_bridge.py` lines 153–156

```python
def on_connect(client, userdata, connect_flags, reason_code, properties) -> None:
    if reason_code != 0:
        print(f"[bridge] Broker connection refused — rc={reason_code}")
        sys.exit(1)
```

In paho-mqtt v2, callbacks execute on paho's internal network thread, not the main thread. `sys.exit(1)` raises `SystemExit` which propagates up the callback stack and terminates the callback thread. The main thread continues running `loop_forever()` and keeps attempting reconnection. The process appears alive but will never process messages. A monitoring script watching the PID would show a healthy bridge on a silently dead internal loop.

**Verdict: In-Code Fix**

Replace `sys.exit(1)` with `os._exit(1)` (which terminates all threads unconditionally) so the process actually dies and a process supervisor (or the engineer) can see and restart it.

---

### 2.2 — Timer/Reading Race Condition: Session Can Close Despite Reconnect

**Code location:** `mqtt_bridge.py` lines 78–110

At the 30-second grace period boundary, a two-thread race is possible:

1. `_fire_disconnect()` acquires `_lwt_lock`, sets `_lwt_timer = None`, releases lock
2. A reading arrives on the MQTT thread — `_cancel_lwt_timer()` finds `_lwt_timer is None` and returns without cancelling
3. `_fire_disconnect()` calls `notify_disconnect()` — session closes in FastAPI
4. `post_reading()` sends the reading — receives 400 "No active patient" — reading is dropped

The race window is approximately 2 seconds wide (the HTTP timeout of `notify_disconnect`) at the exact 30-second mark.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The LWT grace timer and the incoming reading handler share a mutex-protected timer reference. A sub-2-second TOCTOU race exists at the 30-second boundary where the timer fires concurrently with an arriving reading. The probability is approximately 2 s ÷ 30 s ≈ 6% on any reconnect that occurs within 30 seconds of an LWT. A production implementation would use an asyncio-based single-threaded event loop for the bridge, eliminating the inter-thread race entirely."*

---

### 2.3 — `REQUEST_TIMEOUT = 2` Can Drop Readings During Supabase Latency Spikes

**Code location:** `mqtt_bridge.py` line 63

```python
REQUEST_TIMEOUT = 2
```

Each `POST /api/readings` triggers Pydantic validation + `get_status()` + XGBoost inference + a Supabase round-trip for alert upsert (~100–300ms under normal conditions, potentially >500ms under Supabase cold starts or congestion). If the full pipeline exceeds 2 seconds, the bridge times out, logs an error, and drops the reading. At 1 Hz, this creates a visible gap in the SSE chart.

**Verdict: In-Code Fix**

Bump `REQUEST_TIMEOUT` from `2` to `5`. This is a one-line change that directly improves demo reliability without any architectural tradeoff. A 5-second timeout still catches a genuinely frozen FastAPI server without holding up the next reading for more than one cycle.

---

### 2.4 — No Startup Health-Check Before `loop_forever()`

If `mqtt_bridge.py` starts while Mosquitto is not yet running (e.g. Docker image still pulling), `client.connect()` raises `ConnectionRefusedError` and the bridge exits immediately. The engineer must notice and restart it manually.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The bridge has a hard dependency on Mosquitto being available at startup. The start-bedside.sh script enforces startup order. A production deployment would use systemd's Requires=mosquitto.service directive or a Docker Compose healthcheck dependency to handle the race automatically."*

---

## Layer 3 — Local FastAPI Backend

---

### 3.1 — `session.py` Uses Blocking Supabase Calls Inside an Async Handler

**Code location:** `backend/local/routers/session.py` lines 22–31

```python
@router.post("/api/session/login")
async def login(body: LoginIn, request: Request):
    patient = get_patient_by_ic(body.ic_number)   # synchronous — blocks event loop
    open_session(patient["id"])                    # synchronous — blocks event loop
```

Compare to `device.py` which correctly wraps blocking I/O:
```python
await asyncio.to_thread(close_active_session, patient_id, "device_disconnect")
```

The session login route blocks uvicorn's async event loop for the duration of Supabase network I/O (~100–300ms). During this block, no other coroutines run — including `POST /api/readings` from the ESP32.

**Verdict: Thesis Defense**

Under single-nurse, single-patient operation with infrequent logins, the observable impact is zero — at most one reading is held in TCP buffers. For the thesis: *"Session management routes use synchronous Supabase calls within async handlers, which is a blocking anti-pattern in an async web framework. The readings endpoint correctly wraps all blocking I/O in asyncio.to_thread(). Refactoring session routes to be fully async is a documented codebase consistency improvement."*

---

### 3.2 — Ghost Session Closure Tagged as `device_disconnect` Corrupts the Audit Trail

**Code location:** `backend/local/supabase_client.py` lines 41–47

```python
def open_session(patient_id: str) -> str:
    close_active_session(patient_id, reason="device_disconnect")   # always
    result = client.table("sessions").insert({"patient_id": patient_id}).execute()
    return result.data[0]["id"]
```

When a nurse logs in and a dangling ghost session exists (from a FastAPI restart or a previous logout that failed mid-write), the ghost is closed with `closed_reason = "device_disconnect"`. This is semantically incorrect — the ghost was not closed because the ESP32 disconnected. In the admin UI's session log, that ghost session appears with reason `device_disconnect`, misleading the clinician and corrupting the medical audit trail.

**Verdict: In-Code Fix**

Change the hardcoded `"device_disconnect"` inside `open_session()` to a distinct controlled-vocabulary value such as `"ghost_session_cleanup"`. The session log then accurately reflects what happened.

---

### 3.3 — Heartbeat Watchdog Has a TOCTOU Window That Can Clear a Newly-Logged-In Patient's State

**Code location:** `backend/local/main.py` lines 68–83

```python
patient_id = app.state.active_patient_id           # read  (A)
...
if elapsed > _DEVICE_TIMEOUT_SECONDS:
    await asyncio.to_thread(                       # yields control (B)
        close_active_session, patient_id, "auto_timeout"
    )
    app.state.active_patient_id = None             # write (C)
```

Between (A) and (C), the coroutine yields at (B). If a nurse logs in a new patient between B and C, the watchdog resumes at C and unconditionally clears `app.state.active_patient_id` — erasing the new patient's session ID from memory without closing their Supabase session row. The bedside dashboard then shows no active patient despite the nurse just logging in.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The heartbeat watchdog performs a non-atomic read-modify-write across an awaited thread boundary — a classic TOCTOU window in cooperative async code. The fix is to re-read app.state.active_patient_id after the awaited close_active_session call and only clear it if it still matches the patient_id that was captured before the await. In a single-nurse prototype, this race requires the 5-minute watchdog timeout to fire at the exact instant of a new login — the practical probability is negligible."*

---

### 3.4 — SQLite Opens a New Connection on Every Read and Write

**Code location:** `backend/local/sync.py` lines 54–82

```python
def _db_insert(payload: dict) -> int:
    con = sqlite3.connect(_DB_PATH)
    ...
    con.close()

def _db_delete(row_id: int) -> None:
    con = sqlite3.connect(_DB_PATH)
    ...
    con.close()
```

At 1 Hz with cloud failures, the sync worker opens and closes 2 SQLite connections per reading. SQLite's default journal mode creates and removes a journal file per transaction. Under heavy backlog replay, this creates measurable filesystem I/O. WAL mode with a persistent connection pool would be significantly more efficient.

**Verdict: Thesis Defense**

This is explicitly covered by the documented "flat retry / Future Work" limitation in both CLAUDE.md and the thesis. Reference that section directly if asked.

---

## Layer 4 — Frontend Components (Next.js 16)

---

### 4.1 — Both SSE Hooks Leak EventSource Listeners on Component Unmount

**Code location:**  
`frontend/bedside/components/StatusCard/StatusCard.hooks.ts` lines 43–57  
`frontend/admin/components/StatusCard/StatusCard.hooks.ts` lines 53–64

```typescript
es.onerror = () => {
    setStatus("connecting");
    es.close();
    setTimeout(connect, 3000);    // schedules callback — component may unmount before it fires
};

return () => {
    esRef.current?.close();       // closes the CURRENT es, but the timeout is still pending
};
```

**The leak sequence:**
1. SSE connection errors during a network blip
2. `es.close()` closes this EventSource instance
3. `setTimeout(connect, 3000)` schedules a reconnect
4. Nurse navigates away — React unmounts the component
5. Cleanup runs: `esRef.current?.close()` — closes the already-closed instance (no-op)
6. Three seconds later, `setTimeout` fires — `connect()` creates a new EventSource
7. The new EventSource is stored in the closure-captured `esRef` and is never closed

Each navigate-away-during-reconnect leaves an orphaned browser SSE connection open to the backend. After enough login/logout cycles (common in a ward environment), the browser's connection pool degrades.

**Verdict: In-Code Fix**

Add a `reconnectRef = useRef<ReturnType<typeof setTimeout>>()` to both hooks. Assign `reconnectRef.current = setTimeout(connect, 3000)` in the error handler, and add `clearTimeout(reconnectRef.current)` to the cleanup function alongside the existing `esRef.current?.close()`. This is the standard React hook cleanup pattern.

---

### 4.2 — Silent `catch {}` in SSE Message Handlers Makes Debugging Invisible

**Code location:** Both SSE hooks, `onmessage` handler

```typescript
es.onmessage = (e) => {
    try {
        const data: StreamReading = JSON.parse(e.data);
        ...
    } catch {}   // zero-width silence
};
```

If the backend changes the SSE payload shape (e.g. a field rename during a hot redeploy), all SSE messages are silently discarded. `latest` stays `null`. The dashboard shows a perpetual connecting spinner. No error appears in the browser console. Because `onerror` is not triggered — only `onmessage` — the 3-second reconnect never fires.

**Verdict: In-Code Fix**

Add `console.warn("[SSE] Parse error:", err)` inside both catch blocks. This is a zero-cost change that makes the feedback loop from backend to frontend visible during development and live demos. An examiner watching the browser DevTools console will notice immediately if any SSE message is malformed.

---

### 4.3 — `isStale` Depends on Client-Side Clock Accuracy

**Code location:** `frontend/admin/components/StatusCard/StatusCard.hooks.ts` line 46

```typescript
const readingAge = Date.now() - new Date(data.ts).getTime();
setIsStale(readingAge > STALE_THRESHOLD_MS);
```

`Date.now()` is the browser's local clock. `data.ts` is the server's UTC timestamp from the bedside machine. If the bedside machine's clock drifts (NTP failure, timezone misconfiguration), the computed `readingAge` is wrong. A +20-second drift would make all readings appear permanently stale, triggering the aggressive 5-second session polling even when the device is healthy.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The stale-detection mechanism compares the server-issued timestamp against the browser's local clock. Clock drift between the bedside gateway and the admin browser would produce false stale signals. The 15,000ms threshold provides a 13-second tolerance above the expected 2-second cloud SSE re-send interval, absorbing minor NTP drift. In a clinical deployment, both systems would be NTP-synchronised as a standard OS-level requirement."*

---

## Layer 5 — ML & CDSS Layer (XGBoost + Claude API)

---

### 5.1 — `_validate_analysis` Does Not Detect Output Truncation from `max_tokens=550`

**Code location:** `backend/cloud/claude_service.py` lines 41–45

```python
def _validate_analysis(text: str) -> str:
    if all(marker in text for marker in _REQUIRED_SECTIONS):
        return text
    return _FALLBACK_ANALYSIS
```

With `max_tokens=550`, the model may truncate output mid-sentence in the third section. Consider:

```
📥 **What Happened**
Temperature spiked to 38.7°C. Reading sustained across 8 minutes.

🔍 **Root Cause Hypothesis**
• Physiological: concurrent BPM rise confirms fever pattern
• SpO₂ stable at 97% — no hypoxic component
• Gradual onset excludes sensor artifact

⚡ **Recommended Next Steps**
• Reassess in 15 min; escalate if temperature exceeds
```

All three emoji ARE present → validation passes. The frontend renders an instruction that stops mid-sentence. The nurse reads a truncated clinical recommendation.

**Verdict: In-Code Fix**

Increase `max_tokens` from 550 to 650 in the `analyze_alert_event` call. The system prompt is ~400 tokens, the three-section response averages ~480 tokens — 550 is genuinely tight. Alternatively, add a minimum character-after-last-emoji check to `_validate_analysis` before returning the response.

---

### 5.2 — Prompt Table Header Claims Full Reading Count; Claude Only Sees First 25

**Code location:** `backend/cloud/claude_service.py` lines 251–264

```python
return {
    ...
    "n_readings": len(readings),     # full count, e.g. 120
    "table": "\n".join(rows) ...     # rows[:25] only
}
```

The prompt text sent to Claude includes: `"SENSOR TELEMETRY — {ctx['n_readings']} readings in event window"` where `n_readings` is the full count. But `rows` is built from `readings[:25]`. If an alert window has 120 readings, Claude is told there are 120 but shown only 25 in the telemetry table. Claude then produces analysis that references "across all 120 readings" but its temporal pattern recognition is based on only the first 25 seconds of a 2-minute event.

**Verdict: In-Code Fix**

Change the table header format string in `_build_event_context` from `{ctx['n_readings']} readings in event window` to `First {len(rows)} of {ctx['n_readings']} readings shown`. This accurately sets Claude's expectations and prevents false confidence in trend analysis based on a truncated window.

---

### 5.3 — Prompt Cache Blocks Are Mutable Lists With No Mutation Guard

**Code location:** `backend/cloud/claude_service.py` lines 315–321

```python
_SYSTEM_COPILOT_INITIAL_BLOCKS: list[dict] = [
    {
        "type": "text",
        "text": _SYSTEM_COPILOT_INITIAL,
        "cache_control": {"type": "ephemeral"},
    }
]
```

The Anthropic prompt cache keys on the exact byte content and structural order of system blocks. `_SYSTEM_COPILOT_INITIAL_BLOCKS` is a mutable Python list. Any in-process code that accidentally calls `_SYSTEM_COPILOT_INITIAL_BLOCKS.append(...)` or mutates the dict would silently break the cache — requests still succeed but pay full token cost on every call, with no runtime error or log warning.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"Prompt cache block integrity depends on the static content of module-level constants. Python has no built-in immutable dict literal. A production Claude API service would use types.MappingProxyType or a frozen dataclass to guard against accidental mutation that would silently degrade cache performance."*

---

### 5.4 — `stream_generate_summary` Has No Retry; `analyze_alert_event` Does

**Code location:** `backend/cloud/claude_service.py`

`analyze_alert_event` (lines 357–373): 3-attempt retry with exponential backoff on HTTP 500/503/529.

`stream_generate_summary` (lines 158–165): No retry — a single `async with _async_client.messages.stream(...)` with no error handling beyond the exception propagating up to the FastAPI handler.

If Anthropic returns a 529 (overloaded) during a summary stream, the SSE connection to the frontend receives a partial stream that never sends a `done` event. The `AISummaryPanel` component stays in a perpetual loading state with no way to recover without a page refresh.

**Verdict: In-Code Fix**

In the `summary.py` FastAPI route handler, catch `anthropic.APIStatusError` and yield a `{"type": "error", "message": "..."}` SSE event. The frontend already has handling for `{"type": "error"}` per the API contract in CLAUDE.md — it just needs the server to actually send it on failure.

---

### 5.5 — `hr_spo2_ratio` Produces Extreme Out-of-Distribution Feature When SpO₂ Approaches Zero

**Code location:** `backend/local/ml/predict.py` line 98

```python
hr_spo2_ratio = float(bpm) / max(float(spo2), 0.001)  # guard ÷0
```

If `spo2 = 0.001` (the guard floor), `hr_spo2_ratio = BPM × 1000`. The training distribution for `hr_spo2_ratio` is approximately 0.6–1.5. A value of 75,000 is extreme beyond any scaler normalisation. However, SpO₂ ≤ 90% already triggers `health_status = "danger"`, which activates the OOD safety override that forces `prediction = "anomaly"` regardless of the ML result. Correctness here depends on two separate code paths aligning — the override exists precisely to guard this case.

**Verdict: Thesis Defense**

**Viva preparation:**  
*"The hr_spo2_ratio feature degrades at extreme SpO₂ values that fall outside the training distribution. Correctness is maintained by the OOD safety override in readings.py, which forces prediction = 'anomaly' whenever the rule-based engine declares danger. This two-layer guard is a deliberate safety-by-design pattern: the rule engine acts as a guard rail for the ML layer on values the ML model was never trained to classify."*

---

## Consolidated Audit Table

| # | Layer | Finding | Verdict |
|---|---|---|---|
| 1.1 | Firmware | SpO₂ constrained 95.5–99.8%: SpO₂ alerts can never trigger | Thesis Defense |
| 1.2 | Firmware | BPM detection window 50–120 suppresses clinically significant extremes | Thesis Defense |
| 1.3 | Firmware | CLAUDE.md documents temperature retry that does not exist in code | **In-Code Fix** |
| 1.4 | Firmware | `ESP.restart()` generates spurious LWT events on WiFi timeout | Thesis Defense |
| 1.5 | Firmware | Shared I2C bus: MAX30102 removal can freeze MLX90614 reads | Thesis Defense |
| 2.1 | Bridge | `sys.exit(1)` in paho callback thread does not terminate the process | **In-Code Fix** |
| 2.2 | Bridge | Timer/reading race at 30-second boundary can close session on reconnect | Thesis Defense |
| 2.3 | Bridge | `REQUEST_TIMEOUT = 2` drops readings during Supabase latency spikes | **In-Code Fix** |
| 2.4 | Bridge | No startup health-check before `loop_forever()` | Thesis Defense |
| 3.1 | Backend | `session.py` blocks event loop on synchronous Supabase calls | Thesis Defense |
| 3.2 | Backend | Ghost session closure tagged `device_disconnect` corrupts audit trail | **In-Code Fix** |
| 3.3 | Backend | Watchdog TOCTOU clears new patient state after concurrent new login | Thesis Defense |
| 3.4 | Backend | SQLite opens a new connection per read/write operation | Thesis Defense |
| 4.1 | Frontend | `setTimeout` not cleared on unmount: EventSource memory leak in both hooks | **In-Code Fix** |
| 4.2 | Frontend | Silent `catch {}` in SSE handler hides all payload format errors | **In-Code Fix** |
| 4.3 | Frontend | `isStale` depends on client-side clock matching server clock | Thesis Defense |
| 5.1 | ML/CDSS | `_validate_analysis` does not detect output truncation from `max_tokens=550` | **In-Code Fix** |
| 5.2 | ML/CDSS | Prompt table header claims full count; Claude only sees first 25 readings | **In-Code Fix** |
| 5.3 | ML/CDSS | Prompt cache blocks are mutable lists with no mutation guard | Thesis Defense |
| 5.4 | ML/CDSS | `stream_generate_summary` lacks retry; leaves frontend in perpetual loading | **In-Code Fix** |
| 5.5 | ML/CDSS | `hr_spo2_ratio` OOD at extreme SpO₂: correctness depends on two-path alignment | Thesis Defense |

**Total: 9 In-Code Fixes | 12 Thesis Defense Points**

---

## Priority Shortlist

### Top 5 In-Code Fixes to Resolve Before the Demo

These are the highest-impact fixes ordered by examiner-discovery probability:

1. **4.1 — SSE memory leak** (`reconnectRef` not cleared on unmount)  
   Every login/logout cycle during the live demo in front of the examiner reproduces this.

2. **1.3 — CLAUDE.md/code discrepancy on temperature retry**  
   An examiner who reads CLAUDE.md and then opens `main.ino` finds this immediately. It makes the documentation untrustworthy.

3. **5.2 — Table count/truncation mismatch misleads Claude's analysis**  
   Claude is told it has 120 readings but only sees 25. Any examiner who reads the prompt template will catch it.

4. **2.1 — Bridge `sys.exit(1)` in callback thread**  
   Startup reliability: if the examiner starts the bridge before Mosquitto is running, the process silently zombies instead of dying cleanly.

5. **3.2 — Ghost session tagged as `device_disconnect`**  
   The session log is a medical audit trail. Incorrect `closed_reason` values are a clinical data integrity issue with an obvious one-line fix.

### Top 3 Thesis Defense Preparations

Prepare scripted verbal answers for these — do not try to patch them:

1. **1.1 — SpO₂ simulation with constrain()** — Highest probability examiner gotcha. Proactively name it before they do.
2. **3.3 — Watchdog TOCTOU window** — Demonstrates you understand async concurrency and race conditions at a graduate level.
3. **2.2 — LWT grace timer race** — Demonstrates system-level thinking about multi-threaded bridge behaviour beyond the happy path.
