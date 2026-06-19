FROM oven/bun:1-alpine
WORKDIR /app

# Copy package files for dependencies caching
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-config/package.json ./packages/shared-config/
COPY bun.lockb* ./

RUN bun install

EXPOSE 3000

# Run Next.js in development mode
CMD ["bun", "run", "dev:web"]
