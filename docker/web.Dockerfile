# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files for the workspace
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY apps/web ./apps/web
COPY package.json tsconfig.base.json ./
# NEXT_PUBLIC_* vars are inlined into the bundle at build time, so they must be
# present here — not at runtime. Defaults connect to the real API (not mock).
ARG NEXT_PUBLIC_USE_MOCK_API=false
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_USE_MOCK_API=$NEXT_PUBLIC_USE_MOCK_API
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_OUTPUT=standalone
RUN --mount=type=cache,target=/app/apps/web/.next/cache \
    cd apps/web && bunx --no-install next build

FROM node:22-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/web/.next/standalone /app
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
