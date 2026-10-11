# Load tests (k6)

`tests/load/run.sh [base-url]` runs `public.js` (SPA shell + `/api/v1/health`, no login) and writes
`results/<timestamp>.log` and `.json`. Install k6 from https://github.com/grafana/k6/releases (or set `K6=/path/to/k6`).

## Baseline: 2026-10-12, https://domus.aiyuayaan.uk (v0.0.1-alpha.4, via Cloudflare Tunnel)
Ramp 10 → 25 → 50 VUs over 3 min, 1 s think time.
- 5622 requests, 0 failed, all checks passed; ~31 req/s sustained at 50 VUs.
- Latency avg 244 ms, p95 284 ms, max 927 ms (min 213 ms is mostly tunnel round trip from this client).
- Not covered: authenticated API (devices, WebSocket/events), where SQLite write contention would show first.
  Add a login-based scenario next; use the separate test server from the memory note, not prod.
- Limit not found: 50 VUs showed no degradation. Raise the stages to find the break point.
