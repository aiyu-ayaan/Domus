# Docus System Architecture

## Overview

Docus is designed as a local-first, privacy-respecting, high-performance smart home platform. The system operates as a modular monolith in Rust coupled with an asynchronous event bus, an embedded/external SQLite database, and an MQTT broker.

## High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients ["Client Applications"]
        WebClient["React 18 Web UI\n(Apple Liquid Glass Theme)"]
        DesktopClient["Electron Desktop Shell"]
        MobileClient["Mobile Companion (Future)"]
    end

    subgraph CoreBackend ["Rust Backend Modular Monolith (backend/)"]
        subgraph Transport ["API & Transport Layer"]
            Router["Axum HTTP & WS Router"]
            AuthMW["JWT & Session Auth Middleware"]
        end

        subgraph CoreModules ["Business Modules"]
            AuthMod["Auth & User Multi-Account"]
            DeviceMod["Device Registry & State"]
            RoomMod["Room & Zone Manager"]
            EnergyMod["Energy Monitoring & Tariff Billing"]
            AutoMod["Automations & Scenes"]
            NotifyMod["Notification Center"]
        end

        subgraph Engine ["Automation Engine"]
            AutoEngine["Rule Evaluator & Triggers"]
        end

        subgraph Infra ["Infrastructure Layer"]
            EventBus["Tokio Broadcast EventBus"]
            DBPool["SQLx SQLite Connection Pool"]
            MqttService["Rumqttc Client Service"]
        end

        subgraph BackgroundWorkers ["Workers"]
            DeviceWorker["Device Health & Heartbeat Worker"]
            ScheduleWorker["Cron & Schedule Worker"]
        end

        subgraph Plugins ["Integration Plugins"]
            TuyaPlug["Tuya Integration (QR Scan Auth)"]
            TapoPlug["TP-Link Tapo (Local LAN)"]
            XiaomiPlug["Xiaomi MiHome (Local / Cloud)"]
            MqttPlug["MQTT & Zigbee2MQTT Bridge"]
            MatterPlug["Matter / Thread Adapter"]
        end
    end

    subgraph External ["Hardware & Storage Layer"]
        SQLiteFile[("docus.db (Encrypted SQLite)")]
        MqttBroker[("Mosquitto MQTT Broker")]
        SmartDevices["Smart Switches, Plugs, Air Purifiers, Lights"]
    end

    WebClient -->|HTTP / REST| Router
    DesktopClient -->|HTTP / REST| Router
    MobileClient -.->|HTTP / REST| Router

    Router --> AuthMW
    AuthMW --> CoreModules

    CoreModules --> DBPool
    CoreModules --> EventBus
    EventBus <--> AutoEngine
    EventBus <--> MqttService
    EventBus <--> DeviceWorker

    AutoEngine --> Plugins
    Plugins --> SmartDevices
    MqttService --> MqttBroker
    DBPool --> SQLiteFile
```

## Data Flow: Device State & Energy Metering

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Web Dashboard
    participant API as Axum Backend
    participant Bus as EventBus (Tokio)
    participant Engine as Automation Engine
    participant DB as SQLite DB
    participant Device as Smart Switch / Air Purifier

    User->>UI: Toggle Switch ON
    UI->>API: PUT /api/v1/devices/{id}/state (is_on: true)
    API->>DB: UPDATE devices SET state_json = ...
    API->>Bus: SystemEvent::DeviceStateChanged
    Bus->>Engine: Evaluate triggers & conditions
    API->>Device: Dispatch command via Plugin / MQTT
    Device-->>API: Live Power Report (145 W)
    API->>DB: INSERT INTO energy_metrics (watts, kwh)
    API-->>UI: State updated & power load refreshed
```

## Architecture Invariants
1. **Local Independence**: Operations function completely offline on the home server.
2. **Modular Decoupling**: Each module exposes clear route contracts and domain boundaries.
3. **Pluggable Integrations**: All device ecosystems adhere to `home_core::IntegrationPlugin`.
4. **Encrypted Persistence**: All credentials, tokens, and telemetry are stored encrypted in SQLite.
