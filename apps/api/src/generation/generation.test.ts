import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import type { GenerationGraph, GenerationResult } from "@spill/ai";
import { parseEnvironment } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import type { AdminStore } from "../admin/types.js";
import { createApp } from "../app.js";
import type { GenerationStore } from "./types.js";

const sessionToken = "g".repeat(43);
const actor: AuthUser = {
  id: "000000000000000000000001",
  name: "Curator",
  email: "curator@example.com",
  role: "admin",
  emailPreferences: { teaUpdates: true, productUpdates: false },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
const roomId = "000000000000000000000004";
const issueId = "000000000000000000000005";

test("admin can brew an active Tea Room and persist the generation result", async () => {
  let started = false;
  let completed = false;
  const authStore = {
    findSession: async (tokenHash: string) =>
      tokenHash === hashSessionToken(sessionToken)
        ? { userId: actor.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async (id: string) => (id === actor.id ? actor : null),
  } as unknown as AuthStore;
  const adminStore = {
    getTeaRoom: async () => ({
      id: roomId,
      name: "Technology",
      description: "Tech news",
      status: "active",
      topics: ["AI"],
      sips: [
        {
          id: "000000000000000000000006",
          title: "AI releases",
          description: "Recent releases",
          type: "latest_news",
          itemCount: 1,
          instructions: "Cite sources",
          order: 0,
          researchSources: [],
          timeRangeDays: 7,
          writingStyle: "Clear",
          contentLength: "short",
        },
      ],
    }),
  } as unknown as AdminStore;
  const result: GenerationResult = {
    issueId,
    status: "review",
    completedAt: new Date().toISOString(),
    sips: [],
  };
  const graph = { invoke: async () => ({ output: result }) } as unknown as GenerationGraph;
  const generationStore = {
    createIndexes: async () => {},
    start: async () => {
      started = true;
      return issueId;
    },
    complete: async () => {
      completed = true;
    },
    fail: async () => {
      throw new Error("must not fail");
    },
  } as unknown as GenerationStore;
  const app = createApp(
    null,
    authStore,
    parseEnvironment(),
    undefined,
    adminStore,
    undefined,
    null,
    null,
    undefined,
    graph,
    generationStore,
  );
  const response = await request(app)
    .post(`/api/v1/admin/generation/tea-rooms/${roomId}/brew`)
    .set("Cookie", `spill_session=${sessionToken}`)
    .send();
  assert.equal(response.status, 201);
  assert.equal(response.body.issueId, issueId);
  assert.equal(started, true);
  assert.equal(completed, true);
});

test("generation endpoint requires an active room and an empty body", async () => {
  const authStore = {
    findSession: async (tokenHash: string) =>
      tokenHash === hashSessionToken(sessionToken)
        ? { userId: actor.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async (id: string) => (id === actor.id ? actor : null),
  } as unknown as AuthStore;
  const adminStore = {
    getTeaRoom: async () => ({ id: roomId, status: "paused", sips: [{}] }),
  } as unknown as AdminStore;
  const graph = {
    invoke: async () => {
      throw new Error("must not invoke");
    },
  } as unknown as GenerationGraph;
  const generationStore = {
    start: async () => {
      throw new Error("must not start");
    },
  } as unknown as GenerationStore;
  const app = createApp(
    null,
    authStore,
    parseEnvironment(),
    undefined,
    adminStore,
    undefined,
    null,
    null,
    undefined,
    graph,
    generationStore,
  );
  const inactive = await request(app)
    .post(`/api/v1/admin/generation/tea-rooms/${roomId}/brew`)
    .set("Cookie", `spill_session=${sessionToken}`)
    .send();
  assert.equal(inactive.status, 409);
  const body = await request(app)
    .post(`/api/v1/admin/generation/tea-rooms/${roomId}/brew`)
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ surprise: true });
  assert.equal(body.status, 400);
});
