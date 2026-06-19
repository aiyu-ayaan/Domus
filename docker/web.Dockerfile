FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files for the workspace
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-config/package.json ./packages/shared-config/
COPY bun.lockb* ./

RUN bun install

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY packages ./packages
COPY package.json tsconfig.base.json ./
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
