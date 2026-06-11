# MediSync — Complete Mermaid Diagrams

All 13 architecture diagrams for the MediSync real-time IoT patient health monitoring system.
Paste any individual block into [Mermaid Live Editor](https://mermaid.live) to render it.

---

## 1. System Architecture Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph TD
    subgraph DEVICE["Device Layer"]
        SENSORS["Biometric Sensors"]
        WEARABLE["Wearable Microcontroller"]
        SENSORS --> WEARABLE
    end

    subgraph BEDSIDE["Bedside Processing Layer"]
        BROKER["Wireless Message Broker"]
        GATEWAY["Data Gateway"]
        PROC_ENGINE["Processing Engine"]
        LOCAL_DB[("Local Time-Series Store")]
        SYNC_ENGINE["Cloud Sync Engine"]
        BEDSIDE_DASH["Bedside Dashboard"]
        NOTIFY["Alert Notification Service"]

        BROKER --> GATEWAY
        GATEWAY --> PROC_ENGINE
        PROC_ENGINE --> LOCAL_DB
        PROC_ENGINE --> SYNC_ENGINE
        PROC_ENGINE --> NOTIFY
        LOCAL_DB --> BEDSIDE_DASH
    end

    subgraph CLOUD["Cloud Layer"]
        CLOUD_API["Cloud API Service"]
        CLOUD_DB[("Cloud Time-Series Store")]
        PATIENT_DB[("Central Patient Database")]
        AI_ENGINE["AI Clinical Engine"]
        ADMIN_DASH["Admin Web Dashboard"]

        CLOUD_API --> CLOUD_DB
        CLOUD_API --> PATIENT_DB
        CLOUD_API --> AI_ENGINE
        ADMIN_DASH --> CLOUD_API
    end

    WEARABLE -->|"MQTT - 1 reading per sec"| BROKER
    SYNC_ENGINE -->|"Async Cloud Upload"| CLOUD_DB
    PROC_ENGINE -->|"Session and Alert Writes"| PATIENT_DB
    PATIENT_DB -->|"Patient Records"| CLOUD_API
```

---

## 2. Block Diagram

### 2a. Bedside Processing Pipeline

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
graph TD
    subgraph FW["Device Firmware"]
        FW1["Sensor Module"]
        FW2["Wireless Stack"]
        FW3["Reading Publisher"]
        FW4["Connection Monitor"]
        FW5["Status Indicator"]
        FW1 --> FW3
        FW2 --> FW3
        FW4 --> FW3
        FW3 --> FW5
    end

    subgraph TRANSPORT["Transport Layer"]
        TR1["Message Broker"]
        TR2["Data Bridge"]
        TR3["Disconnect Handler"]
        TR1 --> TR2
        TR1 --> TR3
    end

    subgraph LOCAL_BE["Bedside API"]
        LB10["Heartbeat Monitor"]
        LB9["Session Manager"]
        LB1["Reading Processor"]
        LB2["Status Engine"]
        LB3["Risk Prediction Model"]
        LB4["Safety Override Gate"]
        LB5["Alert Detector"]
        LB6["Cloud Sync Engine"]
        LB7["Notification Service"]
        LB8["Live Data Streamer"]
        LB10 --> LB9
        LB9 --> LB1
        LB1 --> LB2
        LB1 --> LB3
        LB2 --> LB4
        LB3 --> LB4
        LB4 --> LB5
        LB5 --> LB6
        LB5 --> LB7
        LB1 --> LB8
    end

    subgraph STORAGE["Local Storage"]
        ST1[("Time-Series Store")]
        ST4[("Sync Buffer")]
    end

    subgraph FE["Bedside Frontend"]
        FE1["Bedside Dashboard"]
    end

    FW3 -->|"WiFi MQTT"| TR1
    TR2 -->|"HTTP"| LB9
    LB1 --> ST1
    LB6 --> ST4
    ST1 -->|"Latest Reading"| LB8
    LB8 -->|"Live Stream"| FE1
```

### 2b. Cloud Monitoring Pipeline

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
graph TD
    BEDSIDE["Bedside API"]

    subgraph STORAGE["Cloud Storage"]
        ST2[("Cloud Time-Series Store")]
        ST3[("Patient Database")]
    end

    subgraph CLOUD_BE["Cloud API"]
        CB1["Auth Middleware"]
        CB2["Patient Service"]
        CB3["Live Stream Service"]
        CB4["History Service"]
        CB5["Alert Service"]
        CB6["AI Copilot Service"]
        CB7["AI Summary Service"]
        CB8["AI Analysis Module"]
        CB1 --> CB2
        CB1 --> CB3
        CB1 --> CB4
        CB1 --> CB5
        CB1 --> CB6
        CB1 --> CB7
        CB6 --> CB8
        CB7 --> CB8
    end

    subgraph FE["Admin Frontend"]
        FE2["Admin Dashboard"]
    end

    BEDSIDE -->|"Async Upload"| ST2
    BEDSIDE -->|"Sessions + Alerts"| ST3
    ST2 --> CB1
    ST3 --> CB1
    CB2 -->|"REST + SSE"| FE2
    CB3 -->|"REST + SSE"| FE2
```

---

## 3. Use Case Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph LR

    NURSE(["Nurse"])
    ADMIN(["Admin Clinician"])
    DEVICE(["Wearable Device"])
    SYSTEM(["Automated System"])

    subgraph SG_NURSE["Nurse Use Cases"]
        N1(["Register New Patient"])
        N2(["Authenticate Existing Patient"])
        N3(["Monitor Live Vitals"])
        N4(["End Monitoring Session"])
    end

    subgraph SG_ADMIN["Admin Use Cases"]
        A1(["Log In to Dashboard"])
        A2(["View Patient Overview"])
        A3(["Live Remote Monitoring"])
        A4(["Review Historical Trends"])
        A5(["Manage Alert Log"])
        A6(["Generate AI Health Summary"])
        A7(["Analyze Alert with AI Copilot"])
        A8(["View Session History"])
    end

    subgraph SG_DEVICE["Device Use Cases"]
        D1(["Transmit Vital Readings"])
        D2(["Signal Disconnection"])
    end

    subgraph SG_SYSTEM["System Use Cases"]
        S1(["Evaluate Vital Status"])
        S2(["Predict Clinical Risk"])
        S3(["Detect and Log Alerts"])
        S4(["Sync Data to Cloud"])
        S5(["Dispatch Alert Notifications"])
        S6(["Auto-Close Inactive Session"])
    end

    NURSE  --> N1
    NURSE  --> N2
    NURSE  --> N3
    NURSE  --> N4

    ADMIN  --> A1
    ADMIN  --> A2
    ADMIN  --> A3
    ADMIN  --> A4
    ADMIN  --> A5
    ADMIN  --> A6
    ADMIN  --> A7
    ADMIN  --> A8

    DEVICE --> D1
    DEVICE --> D2

    SYSTEM --> S1
    SYSTEM --> S2
    SYSTEM --> S3
    SYSTEM --> S4
    SYSTEM --> S5
    SYSTEM --> S6

    D1 -.->|"triggers"| S1
    D2 -.->|"triggers"| S6
    S3 -.->|"triggers"| S5
```

---

## 4. Sequence Diagram

### 4a. Session Initialisation

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
sequenceDiagram
    participant DISPLAY as Bedside Display
    participant PROC as Processing Engine
    participant RECORDS as Patient Records

    DISPLAY ->> PROC: Patient login request
    PROC ->> RECORDS: Validate patient identity
    RECORDS -->> PROC: Patient confirmed
    PROC ->> RECORDS: Open monitoring session
    PROC -->> DISPLAY: Session active
```

### 4b. Reading Processing Flow

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
sequenceDiagram
    participant DEV as Wearable Device
    participant BROKER as Message Broker
    participant GW as Data Gateway
    participant PROC as Processing Engine
    participant LOCAL as Local Health Store
    participant SYNC as Cloud Sync Queue
    participant DISPLAY as Bedside Display

    DEV ->> BROKER: Transmit vital signs
    BROKER ->> GW: Forward reading
    GW ->> PROC: Submit for processing
    PROC ->> PROC: Evaluate vital status
    PROC ->> PROC: Predict clinical risk
    PROC ->> LOCAL: Store reading
    PROC ->> SYNC: Enqueue for cloud upload
    LOCAL -->> DISPLAY: Stream live vitals
```

### 4c. Alert Detection

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
sequenceDiagram
    participant PROC as Processing Engine
    participant RECORDS as Patient Records
    participant NOTIFY as Notification Service
    participant ADMIN as Admin Dashboard

    PROC ->> RECORDS: Log alert event
    PROC ->> NOTIFY: Dispatch alert notification
    NOTIFY -->> ADMIN: Push alert to admin
```

### 4d. Cloud Sync and Admin Monitoring

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
sequenceDiagram
    participant SYNC as Cloud Sync Queue
    participant CLOUD as Cloud Health Store
    participant CLOUD_API as Cloud API Service
    participant ADMIN as Admin Dashboard
    participant AI as AI Clinical Engine

    SYNC ->> CLOUD: Async cloud sync
    CLOUD_API -->> ADMIN: Stream live vitals
    ADMIN ->> AI: Request AI clinical analysis
    AI -->> ADMIN: Stream clinical insights
```

### 4e. Device Disconnection

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
sequenceDiagram
    participant DEV as Wearable Device
    participant BROKER as Message Broker
    participant GW as Data Gateway
    participant PROC as Processing Engine
    participant RECORDS as Patient Records
    participant ADMIN as Admin Dashboard

    DEV --x BROKER: Connection lost
    Note over BROKER: LWT fires after ~22s keepalive timeout
    BROKER ->> GW: Disconnect signal
    GW ->> PROC: Device offline event
    PROC ->> RECORDS: Close monitoring session
    RECORDS -->> ADMIN: Session ended
```

---

## 5. Activity Diagram

### 5a. Session Initialisation

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
flowchart TD
    START([Nurse arrives at bedside]) --> NURSE_CHOICE{New or existing patient?}

    NURSE_CHOICE -->|New patient| FILL_FORM[Complete patient registration form]
    NURSE_CHOICE -->|Existing patient| ENTER_CREDS[Enter patient ID and access credentials]

    FILL_FORM --> CREATE_PATIENT[Register patient in central database]
    ENTER_CREDS --> VALIDATE_CREDS{Credentials valid?}
    VALIDATE_CREDS -->|No| ENTER_CREDS
    VALIDATE_CREDS -->|Yes| LOOKUP_PATIENT[Retrieve patient record]

    CREATE_PATIENT --> OPEN_SESSION
    LOOKUP_PATIENT --> OPEN_SESSION[Open monitoring session]

    OPEN_SESSION --> END([Dashboard active — begin monitoring])
```

### 5b. Reading Processing Loop

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
flowchart TD
    START([New reading received]) --> RULE_STATUS[Evaluate vital status]
    RULE_STATUS --> ML_INFERENCE[Run risk prediction model]
    ML_INFERENCE --> OOD_CHECK{Safety override required?}
    OOD_CHECK -->|Yes| FORCE_ANOMALY[Override prediction to Anomaly]
    OOD_CHECK -->|No| ALERT_EVAL
    FORCE_ANOMALY --> ALERT_EVAL

    ALERT_EVAL{Alert condition detected?}
    ALERT_EVAL -->|Yes| UPSERT_ALERT[Log alert to central database]
    UPSERT_ALERT --> IS_NEW{New alert?}
    IS_NEW -->|Yes| FIRE_NOTIFY[Dispatch alert notification]
    IS_NEW -->|No| WRITE_LOCAL
    FIRE_NOTIFY --> WRITE_LOCAL
    ALERT_EVAL -->|No| WRITE_LOCAL

    WRITE_LOCAL[Write reading to local time-series store]
    WRITE_LOCAL --> ENQUEUE[Enqueue reading for cloud sync]
    ENQUEUE --> SSE_UPDATE[Broadcast live update to bedside display]
    SSE_UPDATE --> END([Await next reading])
```

### 5c. Session Termination

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
flowchart TD
    START([Session active]) --> TERM{Termination event?}

    TERM -->|Device offline signal| LWT_GRACE[Start disconnect grace period]
    LWT_GRACE --> GRACE_SURVIVED{New reading within grace period?}
    GRACE_SURVIVED -->|Yes| START
    GRACE_SURVIVED -->|No| DEVICE_DISCONNECT[Signal device disconnect]
    DEVICE_DISCONNECT --> SESSION_CLOSED

    TERM -->|Nurse clicks logout| MANUAL_LOGOUT[Manual session logout]
    MANUAL_LOGOUT --> SESSION_CLOSED

    TERM -->|No reading for 5 minutes| AUTO_TIMEOUT[Heartbeat watchdog timeout]
    AUTO_TIMEOUT --> SESSION_CLOSED

    SESSION_CLOSED[Close monitoring session]
    SESSION_CLOSED --> CLEAR_STATE[Clear active session state]
    CLEAR_STATE --> END([Session ended])
```

---

## 6. Class Diagram

### 6a. Core Entities and Data Model

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
classDiagram
    direction TB

    class Patient {
        +UUID id
        +String name
        +String identificationNumber
        +String ward
        +Integer age
        +String gender
        +String assignedDoctor
        +DateTime createdAt
        +register() Patient
        +getByIdentification() Patient
        +getAll() List~Patient~
    }

    class Session {
        +UUID id
        +UUID patientId
        +DateTime startedAt
        +DateTime endedAt
        +Integer durationSeconds
        +String closedReason
        +open(patientId) Session
        +close(patientId, reason) void
        +getByPatient(patientId) List~Session~
    }

    class Alert {
        +UUID id
        +UUID patientId
        +String metric
        +Float value
        +DateTime triggeredAt
        +DateTime resolvedAt
        +upsert(patientId, metric, value) bool
        +resolveAll(patientId) int
        +getAll() List~Alert~
    }

    class VitalReading {
        +String patientId
        +Float spo2
        +Integer bpm
        +Float temperature
        +String status
        +String prediction
        +Float confidence
        +Boolean alert
        +DateTime recordedAt
    }

    class AIAnalysisModule {
        +generateHealthSummary(readings, rangeLabel) AsyncIterator
        +analyzeAlertEvent(alertData, readingsSlice) String
        +streamFollowUp(context, history, message) AsyncIterator
    }

    class CopilotRequest {
        +String metric
        +Float value
        +DateTime triggeredAt
        +DateTime resolvedAt
        +List readingsSlice
    }

    class ChatRequest {
        +String metric
        +Float value
        +DateTime triggeredAt
        +List readingsSlice
        +List conversationHistory
        +String message
    }

    Patient "1" --> "0..*" Session : has
    Patient "1" --> "0..*" Alert : triggers
    Patient "1" --> "0..*" VitalReading : generates
    CopilotRequest --> AIAnalysisModule : requests
    ChatRequest --> AIAnalysisModule : requests
    AIAnalysisModule --> VitalReading : analyzes
```

### 6b. Backend Service Infrastructure

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
classDiagram
    direction TB

    class BedsideAPIService {
        +UUID activePatientId
        +Dict lastReading
        +DateTime lastReadingAt
        +RiskPredictionModel predictionModel
        +startup() Coroutine
        +heartbeatMonitor() Coroutine
    }

    class StatusEngine {
        +evaluateStatus(spo2, bpm, temperature) String
    }

    class RiskPredictionModel {
        +loadModel() void
        +runInference(bpm, temperature, spo2) Dict
        +applyOODOverride(status, prediction, confidence) Tuple
    }

    class CloudSyncEngine {
        +enqueueReading(patientId, payload) void
        +syncWorker() Coroutine
    }

    class NotificationService {
        +sendAlert(patientId, name, metric, value, alertType) Coroutine
    }

    BedsideAPIService --> StatusEngine : uses
    BedsideAPIService --> RiskPredictionModel : uses
    BedsideAPIService --> CloudSyncEngine : uses
    BedsideAPIService --> NotificationService : delegates
```

---

## 7. Component Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph TD
    WEARABLE["Wearable Device"]
    NURSE["Nurse Browser"]
    ADMIN["Admin Browser"]

    subgraph BEDSIDE["Bedside Layer"]
        BROKER["Message Broker"]
        BRIDGE["Data Bridge"]
        BEDSIDE_API["Bedside API Service"]
        LOCAL_DB[("Local Time-Series Store")]
        SYNC_Q[("Sync Queue")]
        DASHBOARD["Bedside Dashboard"]
    end

    subgraph CLOUD["Cloud Layer"]
        CLOUD_API["Cloud API Service"]
        CLOUD_DB[("Cloud Time-Series Store")]
        PATIENT_DB[("Central Patient Database")]
        AI_ENGINE["AI Clinical Engine"]
        NOTIFY["Notification Services"]
        ADMIN_WEB["Admin Web Application"]
    end

    WEARABLE    -->|"WiFi MQTT"| BROKER
    BROKER      --> BRIDGE
    BRIDGE      -->|"Readings"| BEDSIDE_API
    BRIDGE      -->|"Device disconnect event"| BEDSIDE_API
    BEDSIDE_API --> LOCAL_DB
    BEDSIDE_API --- SYNC_Q
    BEDSIDE_API -->|"Live stream"| DASHBOARD
    DASHBOARD   --> NURSE

    BEDSIDE_API -->|"Cloud sync"| CLOUD_DB
    BEDSIDE_API -->|"Sessions and alerts"| PATIENT_DB
    BEDSIDE_API --> NOTIFY

    CLOUD_DB    --> CLOUD_API
    PATIENT_DB  --> CLOUD_API
    CLOUD_API   --> AI_ENGINE
    CLOUD_API   -->|"REST + SSE"| ADMIN_WEB
    ADMIN_WEB   --> ADMIN
```

---

## 8. Data Flow Diagram (DFD)

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph TD
    DEVICE_EXT(["Wearable Device"])
    NURSE_EXT(["Nurse"])
    ADMIN_EXT(["Admin Clinician"])
    NOTIF_EXT(["Notification Channels"])
    AI_EXT(["AI Language Model"])

    P1["P1: Data Ingestion"]
    P2["P2: Vital Signs Processor"]
    P3["P3: Alert Engine"]
    P4["P4: Cloud Sync Engine"]
    P5["P5: Bedside Live Stream"]
    P6["P6: Session Manager"]
    P7["P7: Cloud Data Service"]
    P8["P8: AI Clinical Processor"]

    DS1[("Local Health Records")]
    DS2[("Cloud Health Records")]
    DS3[("Central Patient Database")]
    DS4[("Sync Queue")]

    DEVICE_EXT -->|"Raw vital signs"| P1
    NURSE_EXT -->|"Credentials and patient details"| P6
    P6 -->|"Read and write session state"| DS3
    P6 -->|"Active patient context"| P2
    P1 -->|"Validated reading"| P2
    P2 -->|"Processed reading"| DS1
    P2 -->|"Reading payload"| DS4
    P2 -->|"Status and alert flags"| P3
    DS4 -->|"Queued records"| P4
    P4 -->|"Synced data"| DS2
    P3 -->|"Alert record"| DS3
    P3 -->|"Alert event"| NOTIF_EXT
    DS1 -->|"Latest reading"| P5
    P5 -->|"Live stream"| NURSE_EXT
    ADMIN_EXT -->|"Authenticated query"| P7
    DS2 -->|"Readings"| P7
    DS3 -->|"Patient and alert data"| P7
    P7 -->|"Data response"| ADMIN_EXT
    P7 -->|"Readings slice"| P8
    P8 -->|"Prompts and tokens"| AI_EXT
    P8 -->|"Streaming insights"| ADMIN_EXT
```

---

## 9. Entity-Relationship (ER) Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
erDiagram
    PATIENTS {
        uuid id PK
        text name
        text identificationNumber UK
        text ward
        integer age
        text gender
        text assignedDoctor
        timestamp createdAt
    }

    SESSIONS {
        uuid id PK
        uuid patientId FK
        timestamp startedAt
        timestamp endedAt
        integer durationSeconds
        text closedReason
    }

    ALERTS {
        uuid id PK
        uuid patientId FK
        text metric
        float value
        timestamp triggeredAt
        timestamp resolvedAt
    }

    ADMIN_USERS {
        uuid id PK
        text email
        text encryptedPassword
        timestamp createdAt
    }

    HEALTH_READINGS {
        string patientId
        float spo2
        integer bpm
        float temperature
        string status
        string prediction
        float confidence
        boolean alert
        timestamp recordedAt
    }

    PATIENTS ||--o{ SESSIONS : "has"
    PATIENTS ||--o{ ALERTS : "triggers"
    PATIENTS ||--o{ HEALTH_READINGS : "generates"
```

---

## 10. Flowchart

### 10a. Request Validation & Vital Processing

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
flowchart TD
    START(["Reading request received"]) --> AUTH{Device authorised?}
    AUTH -->|No| R403["Reject — 403"]
    AUTH -->|Yes| ACTIVE{Active patient session?}
    ACTIVE -->|No| R400["Reject — 400"]
    ACTIVE -->|Yes| EXTRACT["Extract vital signs"]

    EXTRACT --> STATUS_EVAL["Evaluate vital status"]
    STATUS_EVAL --> S_RESULT{Status result}
    S_RESULT -->|Critical thresholds breached| DANGER["Status: Danger"]
    S_RESULT -->|Warning thresholds breached| WARNING["Status: Warning"]
    S_RESULT -->|All values within normal range| NORMAL_S["Status: Normal"]

    DANGER --> SPO2_CHECK
    WARNING --> SPO2_CHECK
    NORMAL_S --> SPO2_CHECK

    SPO2_CHECK{SpO2 available?}
    SPO2_CHECK -->|No| ML_DEFAULT["Default: Prediction = Normal"]
    SPO2_CHECK -->|Yes| FEAT_ENG["Compute derived features"]

    FEAT_ENG --> SCALE["Normalise feature vector"]
    SCALE --> PREDICT_PROBA["Run risk prediction model"]
    PREDICT_PROBA --> THRESH{Risk probability exceeds threshold?}
    THRESH -->|Yes| SET_ANOM["Prediction: Anomaly"]
    THRESH -->|No| SET_NORM["Prediction: Normal"]

    ML_DEFAULT --> OOD
    SET_ANOM --> OOD
    SET_NORM --> OOD

    OOD{Safety override required?}
    OOD -->|Yes| OVERRIDE["Override prediction to Anomaly"]
    OOD -->|No| END(["Pass to alert handling"])
    OVERRIDE --> END
```

### 10b. Alert Handling & Storage

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "20px"}}}%%
flowchart TD
    START(["Vital processing complete"]) --> ALERT_GATE{Alert condition detected?}

    ALERT_GATE -->|Yes| UPSERT["Log alert to central database"]
    UPSERT --> IS_NEW{New alert?}
    IS_NEW -->|Yes| FIRE_NOTIFY["Dispatch alert notification"]
    IS_NEW -->|No| WRITE_LOCAL
    FIRE_NOTIFY --> WRITE_LOCAL
    ALERT_GATE -->|No| WRITE_LOCAL

    WRITE_LOCAL["Write reading to local time-series store"]
    WRITE_LOCAL --> ENQUEUE["Enqueue reading for cloud sync"]
    ENQUEUE --> STATE_UPDATE["Update live session state"]
    STATE_UPDATE --> RETURN_200(["Return 200 — success"])
```

---

## 11. Network Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph TD
    WEARABLE["Wearable Device"]
    NURSE["Nurse Browser"]
    ADMIN["Admin Browser"]

    subgraph BEDSIDE["Bedside Machine"]
        BROKER["Message Broker"]
        BRIDGE["Data Bridge"]
        API["Bedside API Service"]
        LOCAL_DB[("Local Time-Series Store")]
        DASHBOARD["Bedside Web Server"]
        BROKER --> BRIDGE
        BRIDGE --> API
        API --> LOCAL_DB
        API --> DASHBOARD
    end

    subgraph CLOUD["Cloud Infrastructure"]
        CLOUD_DB[("Cloud Time-Series Store")]
        PATIENT_DB[("Central Patient Database")]
        CLOUD_API["Cloud API Service"]
        AI_API["AI Language Model API"]
        NOTIFY["Notification Services"]
        ADMIN_WEB["Admin Web Application"]
        CLOUD_API --> CLOUD_DB
        CLOUD_API --> PATIENT_DB
        CLOUD_API --> AI_API
        ADMIN_WEB --> CLOUD_API
    end

    WEARABLE  -->|"WiFi MQTT"| BROKER
    DASHBOARD -->|"Live stream"| NURSE
    API       -->|"Cloud sync"| CLOUD_DB
    API       -->|"Sessions and alerts"| PATIENT_DB
    API       --> NOTIFY
    ADMIN     --> ADMIN_WEB
```

---

## 12. ML Model Architecture Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
flowchart TD
    INPUT["Raw Vital Signs: Heart Rate, SpO2, Temperature"]

    INPUT --> VALID{SpO2 available?}
    VALID -->|No| NO_SPO2["Output: Normal — SpO2 unavailable"]

    VALID -->|Yes| FEATURES["Feature Engineering"]
    FEATURES --> NORMALISE["Feature Normalisation"]
    NORMALISE --> CLASSIFIER["Binary Risk Classifier"]
    CLASSIFIER --> CALIBRATE["Probability Calibration"]
    CALIBRATE --> THRESHOLD{Exceeds clinical decision threshold?}

    THRESHOLD -->|Yes| PRED_ANOMALY["Prediction: Anomaly"]
    THRESHOLD -->|No| PRED_NORMAL["Prediction: Normal"]

    PRED_NORMAL --> OVERRIDE{Danger status with Normal prediction?}
    OVERRIDE -->|Yes| FORCE["Override to Anomaly"]
    OVERRIDE -->|No| OUT_NORMAL["Output: Normal"]

    PRED_ANOMALY --> OUT_ANOMALY["Output: Anomaly"]
    FORCE --> OUT_ANOMALY
```

---

## 13. Deployment Diagram

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"fontSize": "16px"}}}%%
graph TD
    WEARABLE["Wearable Device"]
    NURSE["Nurse Browser"]
    ADMIN["Admin Browser"]

    subgraph BEDSIDE["Bedside Machine"]
        BROKER["MQTT Message Broker"]
        BRIDGE["Data Bridge"]
        API["Bedside API Service"]
        LOCAL_DB[("Local Time-Series Store")]
        SYNC_Q[("Sync Queue")]
        ML[("AI Risk Prediction Model")]
        DASHBOARD["Bedside Web Server"]
        BROKER --> BRIDGE
        BRIDGE --> API
        API --> LOCAL_DB
        API --- SYNC_Q
        API --- ML
        API --> DASHBOARD
    end

    subgraph CLOUD["Cloud Infrastructure"]
        CLOUD_DB[("Cloud Time-Series Store")]
        PATIENT_DB[("Central Patient Database")]
        CLOUD_API["Cloud API Service"]
        AI_API["AI Language Model API"]
        NOTIFY["Notification Services"]
        ADMIN_WEB["Admin Web Application"]
        CLOUD_DB --> CLOUD_API
        PATIENT_DB --> CLOUD_API
        CLOUD_API --> AI_API
        CLOUD_API --> ADMIN_WEB
    end

    WEARABLE  -->|"WiFi MQTT"| BROKER
    DASHBOARD --> NURSE
    API       -->|"Cloud sync"| CLOUD_DB
    API       -->|"Sessions and alerts"| PATIENT_DB
    API       --> NOTIFY
    ADMIN     --> ADMIN_WEB
```

---

*Generated from MediSync codebase — all 13 diagrams.*
