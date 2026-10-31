import assert from "node:assert/strict";
import test from "node:test";
import type { MongoClient } from "mongodb";
import request from "supertest";
import { createApp } from "./app.js";

test("liveness endpoint reports the API is running", async () => {
  const response = await request(createApp()).get("/health/live");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
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
