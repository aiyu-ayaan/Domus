# Docus 

Docus is the home assisant app that will be deploy to the homeserver to controll all smart devices... It will have the plugging like enviroment to plug any integration like tuya,tapo and
many more.. 

It will include all the feature like automaction,ground devices like add them to bedroom, same like [Home Assistant](https://www.home-assistant.io/). 

## MVP
For MVP integration will include the devices from Tuya, Xiomi and Tapo. 

- For Tuya devices use the Scan QR functionality present on the Home Assistant https://www.home-assistant.io/integrations/tuya/#scanning-the-qr-code.. No admin pannel requirents..

## Languages 
Rust + MQTT + React

For Backend use the rust and for frontend use the react and react navigate for desktop build..

pnpm can be use to ran project. with `npm run dev` to ran both backend and frontend and also have `dev:web` and `dev:backend` to ran in individually.. 

For Now database will be sqlite. and make sure all requirest are encrypted.. 


## User Flow 

For the first time login it will ask for the admin user account.. It will have the multi-account with roles and devices customisation and group access. 

App will include the 
- Home Screen with all data like make sure it will support the wide range of deicces for example I have smart switch and air purifier. So smart switch will tell me the current powerussage
and also I can set the electricity bill configuration.. 
- Devices to list down all devices and also that will be devices into two section that can able to create the group of the devices.. 
- Plugin section to connect with different providers 


Home section will contain full dashboard it all the interative data which is needed.

## File Structure

```
home-automation/
├── apps/
│   ├── web/                         # React + TypeScript
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── devices/
│   │   │   │   ├── automations/
│   │   │   │   ├── rooms/
│   │   │   │   └── energy/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── App.tsx
│   │   └── package.json
│   └── desktop/                      # Optional Tauri desktop app
│
├── crates/
│   └── home-core/                   # Shared Rust domain logic
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
│
├── backend/                          # Rust modular monolith
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                   # Application entry point
│       ├── lib.rs                    # Module registration
│       ├── bootstrap.rs              # Initialize app and dependencies
│       ├── config.rs                 # Environment configuration
│       │
│       ├── api/
│       │   ├── mod.rs
│       │   ├── routes.rs
│       │   ├── middleware.rs
│       │   └── error.rs
│       │
│       ├── modules/
│       │   ├── auth/
│       │   │   ├── mod.rs
│       │   │   ├── model.rs
│       │   │   ├── service.rs
│       │   │   ├── repository.rs
│       │   │   └── routes.rs
│       │   │
│       │   ├── devices/
│       │   │   ├── mod.rs
│       │   │   ├── model.rs
│       │   │   ├── service.rs
│       │   │   ├── repository.rs
│       │   │   └── routes.rs
│       │   │
│       │   ├── rooms/
│       │   ├── automations/
│       │   ├── scenes/
│       │   ├── schedules/
│       │   ├── energy/
│       │   ├── notifications/
│       │   └── users/
│       │
│       ├── integrations/
│       │   ├── mqtt/
│       │   ├── matter/
│       │   ├── zigbee/
│       │   └── esp32/
│       │
│       ├── automation_engine/
│       │   ├── mod.rs
│       │   ├── triggers.rs
│       │   ├── conditions.rs
│       │   ├── actions.rs
│       │   └── executor.rs
│       │
│       ├── infrastructure/
│       │   ├── database.rs
│       │   ├── mqtt_client.rs
│       │   ├── event_bus.rs
│       │   └── logging.rs
│       │
│       └── workers/
│           ├── mod.rs
│           ├── device_worker.rs
│           └── scheduler_worker.rs
│
├── migrations/                       # SQL migrations
├── config/
│   ├── default.toml
│   └── development.toml
├── tests/
│   ├── integration/
│   └── fixtures/
├── scripts/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── Cargo.toml                        # Rust workspace root
├── .env.example
├── .gitignore
└── README.md
```

## AI Agents 

- Never add yourself as co-auther in any project.
- Commit message will able have the `scope(Change) : Message` structure
- @Development folder is for you. Add all the docs over their in @docs folder and for any tracking task I have created a @Development/TODO.md file track over their or create a new one if needed.
- You are allow to update the claude.md file or any other file releated to ai brain.
- Always use `codegraph` to scan the code. 
- For achitecture always or any changes make sure always add a achitecture diagram in docs.
- This app targets the most efficient home automaction solution.

## Work

- On this need to work on the web and electron version of the application.. 
- On future will work on the native android app. Currently out of scope 


## UI

UI will will have the transition animation and on each element same like material3-epressive but it will follow the application apple liquid glass ui..

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
