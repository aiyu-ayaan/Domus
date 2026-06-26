# Desktop release builder: electron-builder + Wine (Linux + Windows targets) + Bun.
# macOS .dmg cannot be produced here — build it on a Mac.
#   docker compose -f docker-compose.release.yml run --rm desktop
FROM electronuserland/builder:wine

ENV PATH=/root/.bun/bin:$PATH

# curl is normally present on this image; install defensively for the bun setup.
RUN apt-get update && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile || bun install
RUN sed -i 's/\r$//' /app/scripts/*.sh && chmod +x /app/scripts/*.sh

ENTRYPOINT ["/app/scripts/release-desktop.sh"]
