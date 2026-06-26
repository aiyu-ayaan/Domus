# Static web release builder. Exports the Next.js site to /dist/web at run time
# (so NEXT_PUBLIC_API_URL is a runtime input, not baked into this image).
#   docker compose -f docker-compose.release.yml run --rm web
FROM oven/bun:1

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile || bun install
# Host may have CRLF line endings; normalize so the scripts run under sh.
RUN sed -i 's/\r$//' /app/scripts/*.sh && chmod +x /app/scripts/*.sh

ENTRYPOINT ["/app/scripts/release-web.sh"]
