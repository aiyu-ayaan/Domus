// Public (unauthenticated) load test: SPA shell + health. Run: tests/load/run.sh [base-url]
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE || 'https://domus.aiyuayaan.uk'

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 25 },
    { duration: '60s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
}

export default function () {
  const shell = http.get(`${BASE}/`)
  check(shell, { 'shell 200': (r) => r.status === 200 })
  const health = http.get(`${BASE}/api/v1/health`)
  check(health, { 'health 200': (r) => r.status === 200, 'healthy': (r) => r.json('status') === 'healthy' })
  sleep(1)
}
