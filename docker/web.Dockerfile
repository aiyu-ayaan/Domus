FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files for the workspace
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY bun.lockb* ./

RUN bun install

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY package.json tsconfig.base.json ./
# NEXT_PUBLIC_* vars are inlined into the bundle at build time, so they must be
# present here — not at runtime. Defaults connect to the real API (not mock).
ARG NEXT_PUBLIC_USE_MOCK_API=false
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_USE_MOCK_API=$NEXT_PUBLIC_USE_MOCK_API
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun --filter @domus/web build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "start"]
