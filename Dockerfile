# Domus home server: the Rust backend serving the built web UI over HTTPS.
#   docker compose -f docker-compose.local.yml up -d --build

# The web build is the same for every architecture, so it runs on the build machine's own.
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @domus/web
COPY apps/web apps/web
RUN pnpm --filter @domus/web build

FROM rust:1-bookworm AS backend
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY backend backend
COPY migrations migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    # COPY keeps source mtimes, which can be older than the cached build; touch so cargo rebuilds our crates.
    find crates backend migrations -type f -exec touch {} + && \
    cargo build --release -p domus-backend && cp target/release/domus-backend /domus-backend && \
    mkdir /data

# glibc, libgcc, CA certificates and tzdata, no shell or package manager.
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=backend /domus-backend /usr/local/bin/domus-backend
COPY --from=web /src/apps/web/dist apps/web/dist
COPY config/default.toml config/default.toml
# A new named volume takes this directory's owner. uid 1000 as in earlier images, so existing volumes stay writable.
COPY --from=backend --chown=1000:1000 /data data
USER 1000:1000
# production: listen on every interface (config/development.toml binds loopback only).
ENV APP_ENV=production
VOLUME /app/data
EXPOSE 8443/tcp 48443/udp
CMD ["domus-backend"]
