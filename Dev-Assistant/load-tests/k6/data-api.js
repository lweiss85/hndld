import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const latency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY;

const endpoints = [
  '/data/v1/appliance-lifespan?category=HVAC',
  '/data/v1/vendor-pricing?serviceCategory=CLEANING',
  '/data/v1/service-quality?serviceCategory=CLEANING',
];

export default function () {
  const url = BASE_URL + endpoints[Math.floor(Math.random() * endpoints.length)];

  const res = http.get(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  latency.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'fast': (r) => r.timings.duration < 500,
  });

  errorRate.add(!ok);
  sleep(Math.random() * 2 + 0.5);
}
