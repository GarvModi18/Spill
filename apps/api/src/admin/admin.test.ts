import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import { createApp } from "../app.js";
import type { AdminStore } from "./types.js";

const sessionToken = "a".repeat(43);
const dashboard = {
  teaRooms: 2,
  activeTeaRooms: 1,
  teaLovers: 12,
  activeSubscriptions: 9,
  generatedIssues: 3,
  scheduledIssues: 1,
  awaitingApproval: 1,
  generationFailures: 0,
};

function makeApp(role: "admin" | "reader" = "admin") {
  const user: AuthUser = {
    id: "user-1",
    name: "Curator",
    email: "curator@example.com",
    role,
    emailPreferences: { teaUpdates: true, productUpdates: false },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const authStore = {
    findSession: async (tokenHash: string) =>
      tokenHash === hashSessionToken(sessionToken)
        ? { userId: user.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async (id: string) => (id === user.id ? user : null),
  } as unknown as AuthStore;
  const adminStore = {
    getDashboard: async () => dashboard,
    listTeaRooms: async () => [],
    createTeaRoom: async () => {
      throw new Error("Invalid input must not reach the store");
    },
  } as unknown as AdminStore;
  return createApp(null, authStore, parseEnvironment(), undefined, adminStore);
}

test("Admin Studio routes require an authenticated session", async () => {
  const response = await request(makeApp()).get("/api/v1/admin/dashboard");
  assert.equal(response.status, 401);
});

test("Admin Studio routes reject reader accounts", async () => {
  const response = await request(makeApp("reader"))
    .get("/api/v1/admin/dashboard")
    .set("Cookie", `spill_session=${sessionToken}`);
  assert.equal(response.status, 403);
});

test("admin accounts can load dashboard metrics", async () => {
  const response = await request(makeApp())
    .get("/api/v1/admin/dashboard")
    .set("Cookie", `spill_session=${sessionToken}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, dashboard);
});

test("invalid Tea Room configurations are rejected before storage", async () => {
  const response = await request(makeApp())
    .post("/api/v1/admin/tea-rooms")
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ name: "Needs a schedule", frequency: "weekly" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid Tea Room configuration");
});
