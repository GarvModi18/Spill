import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { ResearchService } from "@spill/ai";
import type { ResearchProvider, ResearchSearchResult } from "@spill/ai";
import { parseEnvironment, type ResearchReceipt } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import { createApp } from "../app.js";
import type { AdminStore } from "../admin/types.js";
import type { ResearchRunInput, ResearchStore, StoredResearchRun } from "./types.js";

const sessionToken = "r".repeat(43);
const sipId = "000000000000000000000002";
const actor: AuthUser = {
  id: "000000000000000000000001",
  name: "Curator",
  email: "curator@example.com",
  role: "admin",
  emailPreferences: { teaUpdates: true, productUpdates: false },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

class MemoryResearchStore implements ResearchStore {
  run: StoredResearchRun | null = null;
  receipts: ResearchReceipt[] = [];

  async createIndexes() {}

  async save(input: ResearchRunInput, result: ResearchSearchResult): Promise<StoredResearchRun> {
    const status: StoredResearchRun["status"] =
      result.receipts.length === 0
        ? result.failures.length > 0
          ? "failed"
          : "completed"
        : result.failures.length > 0
          ? "partial"
          : "completed";
    const run: StoredResearchRun = {
      ...input,
      id: "000000000000000000000003",
      status,
      startedAt: result.retrievedAt,
      finishedAt: result.retrievedAt,
      receiptCount: result.receipts.length,
      failures: result.failures,
    };
    this.run = run;
    this.receipts = result.receipts;
    return run;
  }
}

function makeApp() {
  const authStore = {
    findSession: async (tokenHash: string) =>
      tokenHash === hashSessionToken(sessionToken)
        ? { userId: actor.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async (id: string) => (id === actor.id ? actor : null),
  } as unknown as AuthStore;
  const adminStore = {
    listTeaRooms: async () => [
      {
        id: "000000000000000000000004",
        sips: [
          {
            id: sipId,
            researchSources: [{ type: "github", enabled: true }],
            timeRangeDays: 14,
          },
        ],
      },
    ],
  } as unknown as AdminStore;
  const provider: ResearchProvider = {
    type: "github",
    search: async (_source, query) => [
      {
        url: "https://example.com/research",
        title: query.query,
        sourceName: "Example",
        snippet: "Research evidence",
      },
    ],
  };
  const researchStore = new MemoryResearchStore();
  const researchService = new ResearchService({ providers: [provider] });
  return {
    app: createApp(
      null,
      authStore,
      parseEnvironment(),
      undefined,
      adminStore,
      undefined,
      null,
      researchService,
      researchStore,
    ),
    researchStore,
  };
}

test("admin research search stores and returns normalized receipts for the selected Sip", async () => {
  const { app, researchStore } = makeApp();
  const response = await request(app)
    .post("/api/v1/admin/research/search")
    .set("Cookie", `spill_session=${sessionToken}`)
    .send({ sipId, query: "TypeScript", maxResults: 3 });

  assert.equal(response.status, 200);
  assert.equal(response.body.run.sipId, sipId);
  assert.equal(response.body.run.receiptCount, 1);
  assert.equal(response.body.receipts[0].verificationStatus, "unverified");
  assert.equal(response.body.receipts[0].title, "TypeScript");
  assert.equal(researchStore.run?.query, "TypeScript");
  assert.equal(researchStore.receipts.length, 1);
});
