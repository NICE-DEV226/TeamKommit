// k6 load test — team board endpoint, 100 concurrent users.
// Target: p95 < 200ms. Run: k6 run load/board.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    board: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 100 },
        { duration: '20s', target: 100 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  const res = http.get(`${BASE}/api/board?pageSize=20`);
  check(res, {
    'status 200': (r) => r.status === 200,
    'has teams': (r) => JSON.parse(r.body).teams !== undefined,
  });
  sleep(0.5);
}
