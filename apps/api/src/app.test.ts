import assert from "node:assert/strict";
import test from "node:test";
import type { MongoClient } from "mongodb";
import type { Queue } from "bullmq";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { createApp } from "./app.js";

test("liveness endpoint reports the API is running", async () => {
  const response = await request(createApp()).get("/health/live");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("API responses include security headers and a safe correlation ID", async () => {
  const response = await request(createApp()).get("/health/live").set("X-Request-Id", "client-request-123");
  assert.equal(response.headers["x-request-id"], "client-request-123");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["content-security-policy"], "default-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; style-src 'self'");
  assert.equal(response.headers["strict-transport-security"], undefined);
});

test("malformed correlation IDs are replaced and production responses enable HSTS", async () => {
  const environment = parseEnvironment({ ...process.env, NODE_ENV: "production", AUTH_SECRET: "a-secure-auth-secret-that-is-long-enough" });
  const response = await request(createApp(null, undefined, environment)).get("/health/live").set("X-Request-Id", "<script>");
  assert.match(response.headers["x-request-id"] ?? "", /^[0-9a-f-]{36}$/);
  assert.match(response.headers["strict-transport-security"] ?? "", /max-age=31536000/);
});

test("API rate limiting returns 429 with standard limit headers", async () => {
  const environment = parseEnvironment({ ...process.env, API_RATE_LIMIT_MAX: "2" });
  const app = createApp(null, undefined, environment);
  await request(app).get("/unknown");
  await request(app).get("/unknown");
  const limited = await request(app).get("/unknown");
  assert.equal(limited.status, 429);
  assert.ok(limited.headers["ratelimit"]);
});

test("CORS reflects only configured application origins", async () => {
  const app = createApp();
  const allowed = await request(app).get("/health/live").set("Origin", "http://localhost:5173");
  const rejected = await request(app).get("/health/live").set("Origin", "https://untrusted.example");
  assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
});

test("readiness endpoint fails when MongoDB is not connected", async () => {
  const response = await request(createApp()).get("/health/ready");
  assert.equal(response.status, 503);
  assert.equal(response.body.dependencies.mongodb, "disconnected");
});

test("readiness endpoint reports healthy MongoDB after a successful ping", async () => {
  const database = {
    db: () => ({ command: async () => ({ ok: 1 }) }),
  } as unknown as MongoClient;
  const response = await request(createApp(database)).get("/health/ready");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", dependencies: { mongodb: "connected" } });
});

test("readiness endpoint checks Redis when a delivery queue is configured", async () => {
  const database = { db: () => ({ command: async () => ({ ok: 1 }) }) } as unknown as MongoClient;
  const queue = { getJobCounts: async () => ({ waiting: 0 }) } as unknown as Queue;
  const response = await request(createApp(database, undefined, undefined, undefined, undefined, undefined, null, null, undefined, null, undefined, undefined, queue)).get("/health/ready");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.dependencies, { mongodb: "connected", redis: "connected" });
});

test("readiness endpoint fails when Redis is unavailable", async () => {
  const database = { db: () => ({ command: async () => ({ ok: 1 }) }) } as unknown as MongoClient;
  const queue = { getJobCounts: async () => { throw new Error("Redis down"); } } as unknown as Queue;
  const response = await request(createApp(database, undefined, undefined, undefined, undefined, undefined, null, null, undefined, null, undefined, undefined, queue)).get("/health/ready");
  assert.equal(response.status, 503);
  assert.deepEqual(response.body.dependencies, { mongodb: "connected", redis: "unavailable" });
});
