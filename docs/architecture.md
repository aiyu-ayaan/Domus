# Domus Architecture

Domus uses a modular monolith architecture with clean boundaries:

- `apps/web`: Next.js operator dashboard (detailed guide: [Frontend Docs](file:///d:/VS-Code/AI%20Expermients/Domus/docs/frontend/README.md))
- `apps/api`: FastAPI backend, domain services, and integration adapters (detailed guide: [Backend Docs](file:///d:/VS-Code/AI%20Expermients/Domus/docs/backend/README.md))
- `packages/shared-types`: shared Zod schemas and TypeScript contracts
- `packages/shared-config`: shared configuration values

## Core Rules

- Device access always goes through integrations.
- Web UI talks to the backend through typed API contracts and realtime channels.
- Domain models remain independent from transport and presentation concerns.
