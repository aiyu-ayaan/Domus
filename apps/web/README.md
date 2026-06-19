# Domus Web Application

This is the Next.js 15 App Router web interface and command dashboard for the **Domus** smart home platform.

## Architecture

The application employs a decoupled design using the **Repository Pattern** to separate the user interface from the API networking layer.

```
apps/web/
├── app/                        # Next.js App Router Pages
├── components/                 # Reusable UI & Layout Components
├── mocks/                      # In-Memory Database & Seeding Data
├── providers/                  # Context Providers (Theme, WebSocket)
├── repositories/               # Repository interfaces & Mock implementations
├── services/                   # HTTP client API connector
├── stores/                     # Zustand UI & Cache states
├── types/                      # TypeScript DTOs matching OpenAPI
└── styles/                     # Tailwind CSS configurations
```

### 1. Data Layer & Repository Pattern
All page components read and write data through defined repository interfaces (`repositories/types.ts`). 
- By default, the application runs on **Mock Repositories** (`repositories/mock/`) which read/write to a central client-side local memory store (`mocks/mock-db.ts`).
- To connect to the real backend, implement API client repositories conforming to the interfaces and swap the exports in `repositories/index.ts`.

### 2. State Management (Zustand)
UI states, search queries, filter states, and repository caches are synchronized via Zustand stores:
- `useAuthStore`: Handles user registration, log in session, and remember-me tokens.
- `useHomeStore`: Manages home workspaces list and the active workspace scope.
- `useRoomStore`: Manages room partitions in the active home.
- `useDeviceStore`: Handles device listings, filter queries, and optimistic state control triggers.
- `useIntegrationStore`: Manages ecosystem connectors and scanning states.
- `useSceneStore` & `useAutomationStore`: Coordinates preset environment actions and rule triggers.
- `useNotificationStore`: Manages active system notifications, alert badges, and unread feeds.

### 3. Realtime Updates
The application uses a `RealtimeProvider` context:
- In development/mock mode: Runs a background loop simulating device telemetry changes (thermostat temperature adjustments, plug power load shifts), connection status drops, and security alarms, raising push notifications using `sonner` to make the dashboard feel alive.
- In production/real mode: Opens a standard WebSockets connector directly to the FastAPI event broker.

---

## Development commands

First, make sure you are in the workspace root or inside the `apps/web` folder.

### 1. Install dependencies
```bash
bun install
```

### 2. Run Local Development Server
Starts the Next.js development server on `http://localhost:3000`:
```bash
bun dev
```
*(Or from the monorepo root: `bun run dev:web`)*

### 3. Run Production Build
Verify TypeScript compile safety and optimize static assets:
```bash
bun run build
```
*(Or from the monorepo root: `bun --filter @domus/web build`)*

### 4. Run Linter
```bash
bun run lint
```
