import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import type { AdminStore } from "../admin/types.js";
import { createApp } from "../app.js";
import type { IssueDetail, IssueStore, IssueSummary } from "./types.js";

const token = "i".repeat(43);
const actor: AuthUser = {
  id: "000000000000000000000001",
  name: "Curator",
  email: "curator@example.com",
  role: "admin",
  emailPreferences: { teaUpdates: true, productUpdates: false },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
const detail: IssueDetail = {
  id: "000000000000000000000002",
  teaRoomId: "000000000000000000000003",
  teaRoomName: "Technology",
  title: "Weekly Tech",
  status: "review",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sipCount: 1,
  failedSipCount: 0,
  sips: [
    {
      id: "000000000000000000000004",
      sipId: "000000000000000000000005",
      title: "AI news",
      description: "New developments",
      order: 0,
      status: "needs_review",
      content: "Draft content",
      qualityIssues: [{ code: "unsupported_claim", message: "Needs a source check" }],
      version: 1,
      items: [],
      receipts: [
        {
          url: "https://example.com/source",
          title: "Official source",
          sourceName: "Example",
          retrievedAt: "2026-01-01T00:00:00.000Z",
          snippet: "Evidence",
          sourceType: "web_search",
          verificationStatus: "unverified",
        },
      ],
      versions: [
        {
          version: 1,
          title: "AI news",
          content: "Draft content",
          changedBy: null,
          reason: "generation",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  ],
};

function makeApp(issueStore: IssueStore) {
  const authStore = {
    findSession: async (tokenHash: string) =>
      tokenHash === hashSessionToken(token)
        ? { userId: actor.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async (id: string) => (id === actor.id ? actor : null),
  } as unknown as AuthStore;
  return createApp(
    null,
    authStore,
    parseEnvironment(),
    undefined,
    {} as AdminStore,
    undefined,
    null,
    null,
    undefined,
    null,
    undefined,
    issueStore,
  );
}

test("issue review returns Receipts and immutable versions and saves edits with an expected version", async () => {
  let edit: unknown;
  const summary: IssueSummary = {
    id: detail.id,
    teaRoomId: detail.teaRoomId,
    teaRoomName: detail.teaRoomName,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    sipCount: 1,
    failedSipCount: 0,
  };
  const store = {
    list: async () => [summary],
    get: async () => detail,
    updateSip: async (...args: unknown[]) => {
      edit = args;
      return detail;
    },
  } as unknown as IssueStore;
  const app = makeApp(store);
  const list = await request(app)
    .get("/api/v1/admin/issues?status=review")
    .set("Cookie", `spill_session=${token}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.issues[0].title, "Weekly Tech");
  const response = await request(app)
    .get(`/api/v1/admin/issues/${detail.id}`)
    .set("Cookie", `spill_session=${token}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.issue.sips[0].receipts[0].url, "https://example.com/source");
  assert.equal(response.body.issue.sips[0].versions[0].version, 1);
  const saved = await request(app)
    .patch(`/api/v1/admin/issues/${detail.id}/sips/${detail.sips[0]!.id}`)
    .set("Cookie", `spill_session=${token}`)
    .send({ title: "Edited title", content: "Edited content", expectedVersion: 1 });
  assert.equal(saved.status, 200);
  assert.equal((edit as unknown[])[2], actor.id);
  assert.deepEqual((edit as unknown[])[3], {
    title: "Edited title",
    content: "Edited content",
    expectedVersion: 1,
  });
});

test("approval and rejection require valid state transitions and reasoned rejection", async () => {
  let decision: unknown;
  const store = {
    approve: async (...args: unknown[]) => {
      decision = ["approve", ...args];
      return detail;
    },
    reject: async (...args: unknown[]) => {
      decision = ["reject", ...args];
      return detail;
    },
  } as unknown as IssueStore;
  const app = makeApp(store);
  const approved = await request(app)
    .post(`/api/v1/admin/issues/${detail.id}/approve`)
    .set("Cookie", `spill_session=${token}`)
    .send();
  assert.equal(approved.status, 200);
  assert.deepEqual(decision, ["approve", detail.id, actor.id]);
  const invalid = await request(app)
    .post(`/api/v1/admin/issues/${detail.id}/reject`)
    .set("Cookie", `spill_session=${token}`)
    .send({ reason: "x" });
  assert.equal(invalid.status, 400);
  const rejected = await request(app)
    .post(`/api/v1/admin/issues/${detail.id}/reject`)
    .set("Cookie", `spill_session=${token}`)
    .send({ reason: "Claims need additional support" });
  assert.equal(rejected.status, 200);
  assert.deepEqual(decision, ["reject", detail.id, actor.id, "Claims need additional support"]);
});
