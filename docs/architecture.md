# Domus Architecture

Domus uses a modular monolith architecture with clean boundaries:

- `apps/web`: Next.js operator dashboard
- `apps/api`: FastAPI backend, domain services, and integration adapters
- `packages/shared-types`: shared Zod schemas and TypeScript contracts
- `packages/shared-config`: shared configuration values

## Core Rules

- Device access always goes through integrations.
- Web UI talks to the backend through typed API contracts and realtime channels.
- Domain models remain independent from transport and presentation concerns.
