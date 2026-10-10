# Docus home server: the Rust backend serving the built web UI over HTTPS.
#   docker compose up -d --build

FROM node:24-alpine AS web
WORKDIR /src
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN pnpm install --frozen-lockfile --filter @docus/web
COPY apps/web apps/web
RUN pnpm --filter @docus/web build

FROM rust:1-bookworm AS backend
WORKDIR /src
# Cargo.lock is not committed; it is used when the build context has one.
COPY Cargo.toml Cargo.lock* ./
COPY crates crates
COPY backend backend
COPY migrations migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    # COPY keeps source mtimes, which can be older than the cached build; touch so cargo rebuilds our crates.
    find crates backend migrations -type f -exec touch {} + && \
    cargo build --release -p docus-backend && cp target/release/domus-backend /domus-backend

FROM debian:bookworm-slim
RUN useradd --uid 1000 --create-home docus && mkdir -p /app/data && chown docus /app/data
WORKDIR /app
COPY --from=backend /domus-backend /usr/local/bin/domus-backend
COPY --from=web /src/apps/web/dist apps/web/dist
COPY config/default.toml config/default.toml
USER docus
# production: listen on every interface (config/development.toml binds loopback only).
ENV APP_ENV=production
VOLUME /app/data
EXPOSE 8443/tcp 48443/udp
CMD ["domus-backend"]
