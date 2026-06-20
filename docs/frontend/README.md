# Domus Frontend (UI) Documentation

Welcome to the Domus UI documentation. This folder contains comprehensive documentation detailing how the Next.js frontend application (`apps/web`) is structured, how it manages state, how it communicates with the FastAPI backend, and how to extend it.

This documentation is designed to enable any developer or AI coding agent to quickly understand the UI patterns and successfully integrate new frontend screens with backend APIs.

---

## 📚 Sibling Documentation

For deep dives into specific subsystems of the frontend, refer to the following documents:

- [Architecture Guide](file:///d:/VS-Code/AI%20Expermients/Domus/docs/frontend/architecture.md) — Next.js routing, layouts, template rendering, themes, and CSS/motion design rules.
- [State Management](file:///d:/VS-Code/AI%20Expermients/Domus/docs/frontend/state-management.md) — Zustand stores, states, actions, filtering, caching, and store update lifecycles.
- [Repository Layer & API Client](file:///d:/VS-Code/AI%20Expermients/Domus/docs/frontend/repositories.md) — Abstract repository interfaces, mock vs. real implementation toggle, API client wrapper, JWT token management, and auto-refresh logic.
- [Real-Time WebSocket Sync](file:///d:/VS-Code/AI%20Expermients/Domus/docs/frontend/realtime.md) — Reconnecting WebSocket client, real-time message handler, mock event generator, and store synchronization.

---

## 🛠️ Technology Stack

The frontend is built with the following core technologies:

- **Framework**: [Next.js 15](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/package.json#L26) (App Router, React 19)
- **Styling**: [Tailwind CSS](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/package.json#L46) & [shadcn/ui](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/components/ui/) (CSS-in-JS/utility class-based styling)
- **State Management**: [Zustand](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/package.json#L36) (Zustand stores serve as the client state and UI cache layer)
- **Realtime**: [WebSockets](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/providers/realtime-provider.tsx) (for live-updating device statuses, online states, and notifications)
- **Package Manager**: Bun workspaces

---

## 📂 Directory Layout

The UI codebase is located in [apps/web](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/) and follows a strict design separating presentation from business and network logic:

```
apps/web/
├── app/                        # Next.js App Router (Routes & Pages)
│   ├── auth/                   # Registration, login, password changes
│   ├── automations/            # Automated rule builder and history list
│   ├── devices/                # Device list dashboard and details page ([id])
│   ├── homes/                  # Multi-tenant home space selection/management
│   ├── integrations/           # Smart home integrations (Tapo, Tuya, MQTT, Zigbee, etc.)
│   ├── notifications/          # Live notifications feed and activity log
│   ├── rooms/                  # Room divisions creation & assignment
│   ├── scenes/                 # Premade scene configurations & activation
│   └── settings/               # User profiles and app parameters
├── components/                 # Presentation Components
│   ├── dashboard/              # Grid of devices, room cards, environment metrics
│   ├── layout/                 # Main sidebar navigation shell (app-shell.tsx)
│   ├── shared/                 # Common reusable cards, form inputs, dialogs
│   └── ui/                     # Primitives from shadcn (buttons, inputs, sliders, etc.)
├── mocks/                      # Client-side fake databases for mock mode
├── providers/                  # Application wrappers (Themes, Toast, WebSocket Provider)
├── repositories/               # Data layer abstraction (API vs. Mock implementations)
│   ├── api/                    # Integrates with FastAPI endpoints
│   └── mock/                   # Simulates network logic in-memory
├── services/                   # Raw API connector (api-client.ts)
├── stores/                     # Zustand state definitions
└── types/                      # TypeScript DTOs derived from OpenAPI Spec
```

---

## ⚡ Integration Checklist for AI Agents

When integrating a new backend feature or endpoint into the frontend, follow this standard workflow:

### 1. Update/Verify Types

Ensure the DTOs from the FastAPI backend are reflected in [types/api.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/types/api.ts). Copy any new Pydantic schema schemas into this file as TypeScript types.

### 2. Update Repository Interface

Add the new methods to the corresponding interface in [repositories/types.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/types.ts). For example, if you are adding device dimming:

```typescript
export interface IDeviceRepository {
  // ...
  setBrightness(id: string, brightness: number): Promise<DeviceStateOut>;
}
```

### 3. Update API Implementation

Implement the method in [repositories/api/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/api/) using the [apiClient](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/services/api-client.ts):

```typescript
public async setBrightness(id: string, brightness: number): Promise<DeviceStateOut> {
  return apiClient.post(`/devices/${id}/brightness`, { brightness });
}
```

### 4. Update Mock Implementation

Implement the method in [repositories/mock/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/mock/) so mock mode does not break:

```typescript
public async setBrightness(id: string, brightness: number): Promise<DeviceStateOut> {
  const device = mockDb.getDevice(id);
  device.state.attributes.brightness = brightness;
  return device.state;
}
```

### 5. Add to Zustand Store

Expose the capability to the UI by adding an action to the relevant Zustand store in [stores/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/). Use **optimistic UI updates** when dealing with real-time controls (e.g. toggle switches or dimmers).

### 6. Connect to UI Components

Use the store hook in your page or component:

```tsx
const { setBrightness } = useDeviceStore();
```

---

## 🌐 Configuration & Environment

The app determines its behavior using these variables, configured in `.env` or `.env.local`:

| Variable                   | Description                                          | Example                        |
| :------------------------- | :--------------------------------------------------- | :----------------------------- |
| `NEXT_PUBLIC_API_URL`      | Base URL of the FastAPI backend.                     | `http://localhost:8000`        |
| `NEXT_PUBLIC_WS_URL`       | WebSocket URL of backend events.                     | `ws://localhost:8000`          |
| `NEXT_PUBLIC_USE_MOCK_API` | Toggles in-memory mock repositories vs. backend API. | `true` (mock) or `false` (API) |
