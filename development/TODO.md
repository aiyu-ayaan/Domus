# Docus Project Tracking & Task Plan

## Milestone 1: Workspace & Core Scaffolding (COMPLETED)
- [x] Configure Rust workspace root with `crates/home-core` and `backend`
- [x] Configure pnpm workspace with `apps/web` and `apps/desktop`
- [x] Set up database schema migrations for SQLite (`users`, `devices`, `rooms`, `energy_metrics`, `electricity_settings`, `automations`)
- [x] Implement backend modular monolith structure:
  - [x] `config.rs` (file & env config)
  - [x] `infrastructure` (SQLite connection pool, event bus, MQTT client, logging)
  - [x] `api` (Axum routing, JWT auth middleware, error handling, CORS)
  - [x] `modules` (auth, devices, rooms, automations, scenes, energy, schedules, notifications, users)
  - [x] `integrations` (Tuya QR code session generator, Tapo, Xiaomi, MQTT, Matter, Zigbee, ESP32)
  - [x] `automation_engine` (Triggers, conditions, actions, executor loop)
  - [x] `workers` (Device polling worker, scheduler worker)
- [x] Implement React web client with Apple Liquid Glass UI & Material 3 expressive transitions:
  - [x] Dashboard with live power monitoring & interactive devices (Switch, Air Purifier, Light)
  - [x] Devices management view with filtering & state toggles
  - [x] Rooms view for zone assignment
  - [x] Automations view
  - [x] Energy view with live wattage, monthly forecast, and Electricity Tariff settings editor
  - [x] Plugins view with Tuya QR code pairing interface
- [x] Configure Electron desktop shell in `apps/desktop`
- [x] Create project scripts (`setup.sh`, `docker-compose.yml`, `config/mosquitto.conf`)
- [x] Document system architecture with diagrams in `development/docs/ARCHITECTURE.md`

## Milestone 2: Hardware Driver Implementations (NEXT)
- [ ] Tuya Cloud OpenAPI & Local Tuya protocol implementation
- [ ] Tapo Klap protocol local connection
- [ ] Xiaomi miIO packet encryption & device discovery
- [ ] Live WebSocket streaming for sub-second device state updates

## Milestone 3: Security & Encryption Hardening
- [ ] SQLite database encryption (SQLCipher)
- [ ] Secure vault for device credentials and tokens
- [ ] End-to-end encrypted remote access tunnel
