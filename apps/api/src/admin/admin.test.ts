import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import { createApp } from "../app.js";
import type { AdminStore } from "./types.js";
import type { ResearchService } from "@spill/ai";
import type { ResearchStore } from "../research/types.js";

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

function makeApp(
  role: "admin" | "reader" = "admin",
  adminOverrides: Partial<AdminStore> = {},
  researchService?: ResearchService | null,
  researchStore?: ResearchStore,
) {
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
    ...adminOverrides,
  } as unknown as AdminStore;
  return createApp(
    null,
    authStore,
    parseEnvironment(),
    undefined,
    adminStore,
    undefined,
    null,
    researchService,
    researchStore,
  );
}

test("research search uses saved Sip permissions and persists normalized receipts", async () => {
  const sipId = "a".repeat(24);
  const roomId = "b".repeat(24);
  const sip = {
    id: sipId,
    teaRoomId: roomId,
    title: "Weekly TypeScript",
    description: "TypeScript updates",
    type: "research_summary",
    itemCount: 5,
    instructions: "Prioritize primary sources",
    order: 0,
    researchSources: [{ type: "github", enabled: true }],
    timeRangeDays: 30,
    writingStyle: "Clear",
    contentLength: "medium",
  };
  let searchArgs: unknown;
  let savedArgs: unknown;
  const researchService = {
    search: async (...args: unknown[]) => {
      searchArgs = args;
      return { receipts: [], failures: [], retrievedAt: "2026-10-01T00:00:00.000Z" };
    },
  } as unknown as ResearchService;
  const researchStore = {
    save: async (...args: unknown[]) => {
      savedArgs = args;
      return { id: "c".repeat(24), status: "completed", receiptCount: 0 };
    },
  } as unknown as ResearchStore;
  const app = makeApp(
    "admin",
    { listTeaRooms: async () => [{ id: roomId, sips: [sip] }] as never },
    researchService,
    researchStore,
  );
  const response = await request(app)
    .post("/api/v1/admin/research/search")
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ sipId, query: "TypeScript language changes" });
  assert.equal(response.status, 200);
  assert.deepEqual(searchArgs, [
    [{ type: "github", enabled: true }],
    {
      query: "TypeScript language changes",
      maxResults: 10,
      timeRangeDays: 30,
    },
  ]);
  assert.deepEqual(savedArgs, [
    { teaRoomId: roomId, sipId, query: "TypeScript language changes", requestedBy: "user-1" },
    {
      receipts: [],
      failures: [],
      retrievedAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
});

test("research search remains admin only and rejects Sips without enabled sources", async () => {
  const sipId = "a".repeat(24);
  const researchService = {
    search: async () => {
      throw new Error("must not search");
    },
  } as unknown as ResearchService;
  const researchStore = {
    save: async () => {
      throw new Error("must not store");
    },
  } as unknown as ResearchStore;
  const app = makeApp(
    "reader",
    {
      listTeaRooms: async () =>
        [{ id: "b".repeat(24), sips: [{ id: sipId, researchSources: [] }] }] as never,
    },
    researchService,
    researchStore,
  );
  const forbidden = await request(app)
    .post("/api/v1/admin/research/search")
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ sipId, query: "test query" });
  assert.equal(forbidden.status, 403);
  const noSources = await request(
    makeApp(
      "admin",
      {
        listTeaRooms: async () =>
          [{ id: "b".repeat(24), sips: [{ id: sipId, researchSources: [] }] }] as never,
      },
      researchService,
      researchStore,
    ),
  )
    .post("/api/v1/admin/research/search")
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ sipId, query: "test query" });
  assert.equal(noSources.status, 400);
});

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
