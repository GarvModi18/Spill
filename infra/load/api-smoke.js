import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.API_BASE_URL || "http://localhost:4000";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 30 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const live = http.get(`${baseUrl}/health/live`);
  check(live, { "liveness is healthy": (response) => response.status === 200 });
  const ready = http.get(`${baseUrl}/health/ready`);
  check(ready, { "readiness is healthy": (response) => response.status === 200 });
  http.get(`${baseUrl}/api/v1/tea-rooms`);
  sleep(1);
}
