# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine
WORKDIR /app

# Copy package files for dependencies caching
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

EXPOSE 3000

# Run Next.js in development mode
CMD ["bun", "run", "dev:web"]
