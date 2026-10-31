import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { MemorySaver } from "@langchain/langgraph";
import { createConciergeGraph, type ConciergeModel } from "@spill/ai";
import type { ConciergeReply } from "@spill/shared";
import { parseEnvironment } from "@spill/shared";
import { hashSessionToken } from "../auth/middleware.js";
import type { AuthStore, AuthUser } from "../auth/types.js";
import { createApp } from "../app.js";
import type { AdminStore } from "../admin/types.js";
import type { ConciergeSession, ConciergeStore, StoredProposal } from "./types.js";

const token = "c".repeat(43);
const actor: AuthUser = {
  id: "000000000000000000000001",
  name: "Curator",
  email: "curator@example.com",
  role: "admin",
  emailPreferences: { teaUpdates: true, productUpdates: false },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

class MemoryConciergeStore implements ConciergeStore {
  readonly sessions = new Map<string, ConciergeSession>();
  async createIndexes() {}
  async createSession(userId: string) {
    const now = new Date();
    const session: ConciergeSession = {
      threadId: "00000000-0000-4000-8000-000000000001",
      title: "New conversation",
      messages: [],
      pendingProposal: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(`${userId}:${session.threadId}`, session);
    return session;
  }
  async listSessions(userId: string) {
    return [...this.sessions.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, session]) => session);
  }
  async getSession(userId: string, threadId: string) {
    return this.sessions.get(`${userId}:${threadId}`) ?? null;
  }
  async appendTurn(
    userId: string,
    threadId: string,
    userMessage: ConciergeSession["messages"][number],
    reply: ConciergeReply,
    proposal: StoredProposal | null,
  ) {
    const key = `${userId}:${threadId}`;
    const session = this.sessions.get(key);
    if (!session) return null;
    session.messages.push(userMessage, {
      id: "assistant-message",
      role: "assistant",
      content: reply.assistantMessage,
      createdAt: new Date(),
    });
    session.title = userMessage.content;
    session.pendingProposal = proposal;
    session.updatedAt = new Date();
    return session;
  }
  async appendAssistantMessage(userId: string, threadId: string, content: string) {
    const session = this.sessions.get(`${userId}:${threadId}`);
    if (!session) return null;
    session.messages.push({
      id: "assistant-result",
      role: "assistant",
      content,
      createdAt: new Date(),
    });
    return session;
  }
  async claimProposal(userId: string, threadId: string, proposalId: string) {
    const session = this.sessions.get(`${userId}:${threadId}`);
    if (
      !session?.pendingProposal ||
      session.pendingProposal.id !== proposalId ||
      session.pendingProposal.status !== "pending"
    )
      return null;
    session.pendingProposal.status = "applying";
    return session;
  }
  async setProposalStatus(
    userId: string,
    threadId: string,
    proposalId: string,
    from: "pending" | "applying",
    to: StoredProposal["status"],
  ) {
    const proposal = this.sessions.get(`${userId}:${threadId}`)?.pendingProposal;
    if (!proposal || proposal.id !== proposalId || proposal.status !== from) return false;
    proposal.status = to;
    return true;
  }
}

function makeApp(modelReply: ConciergeReply, role: "admin" | "reader" = "admin") {
  const authStore = {
    findSession: async (sessionHash: string) =>
      sessionHash === hashSessionToken(token)
        ? { userId: actor.id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    findUserById: async () => ({ ...actor, role }),
  } as unknown as AuthStore;
  const chatStore = new MemoryConciergeStore();
  let saveCount = 0;
  const adminStore = {
    listTeaRooms: async () => [],
    createTeaRoom: async () => {
      saveCount += 1;
      return {};
    },
  } as unknown as AdminStore;
  const model: ConciergeModel = { respond: async () => modelReply };
  const graph = createConciergeGraph(model, new MemorySaver());
  const app = createApp(
    null,
    authStore,
    parseEnvironment(),
    undefined,
    adminStore,
    chatStore,
    graph,
  );
  return { app, chatStore, getSaveCount: () => saveCount };
}

const proposalReply: ConciergeReply = {
  intent: "configuration",
  assistantMessage: "I’ve prepared the Tea Room configuration. Please review it below.",
  proposal: {
    kind: "create_tea_room",
    config: {
      name: "AI Weekly",
      slug: "ai-weekly",
      description: "A weekly digest of AI news.",
      category: "Technology",
      topics: ["AI"],
      audience: "AI practitioners",
      coverImage: "",
      editorialVoice: "Clear and curious",
      frequency: "weekly",
      timezone: "Asia/Kolkata",
      schedule: {
        generation: { time: "09:00", weekday: "Friday" },
        reviewDeadline: { time: "18:00", weekday: "Saturday" },
        delivery: { time: "09:00", weekday: "Sunday" },
      },
      defaultResearchSettings: {
        sources: [{ type: "web_search", enabled: true }],
        timeRangeDays: 7,
      },
      emailTemplate: "default",
      isPublic: true,
    },
  },
};

test("configuration proposals require explicit confirmation and cannot be applied twice", async () => {
  const { app, getSaveCount } = makeApp(proposalReply);
  const cookie = `spill_session=${token}`;
  const created = await request(app)
    .post("/api/v1/admin/concierge/sessions")
    .set("Cookie", cookie)
    .send({});
  assert.equal(created.status, 201);
  const threadId = created.body.session.threadId as string;

  const response = await request(app)
    .post(`/api/v1/admin/concierge/sessions/${threadId}/messages`)
    .set("Cookie", cookie)
    .send({ message: "Create a weekly AI Tea Room" });
  assert.equal(response.status, 200);
  assert.equal(response.body.session.pendingProposal.status, "pending");
  assert.match(response.body.session.pendingProposal.preview, /AI Weekly/);
  assert.equal(getSaveCount(), 0);

  const proposalId = response.body.session.pendingProposal.id as string;
  const confirmed = await request(app)
    .post(`/api/v1/admin/concierge/sessions/${threadId}/confirm`)
    .set("Cookie", cookie)
    .send({ proposalId });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.session.pendingProposal.status, "confirmed");
  assert.equal(getSaveCount(), 1);

  const replay = await request(app)
    .post(`/api/v1/admin/concierge/sessions/${threadId}/confirm`)
    .set("Cookie", cookie)
    .send({ proposalId });
  assert.equal(replay.status, 409);
  assert.equal(getSaveCount(), 1);
});

test("reader accounts cannot access Concierge sessions", async () => {
  const { app } = makeApp({ intent: "question", assistantMessage: "Hello" }, "reader");
  const response = await request(app)
    .get("/api/v1/admin/concierge/sessions")
    .set("Cookie", `spill_session=${token}`);
  assert.equal(response.status, 403);
});
