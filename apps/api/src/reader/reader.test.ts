import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { createApp } from "../app.js";
import type { AuthStore, AuthUser, StoredUser } from "../auth/types.js";
import type {
  PublishedIssue,
  PublishedIssueSummary,
  ReaderStore,
  ReaderSubscription,
  TeaRoomDetails,
  TeaRoomPage,
  TeaRoomSummary,
} from "./types.js";

const teaRoom: TeaRoomDetails = {
  id: "room-1",
  name: "AI Weekly",
  slug: "ai-weekly",
  description: "A thoughtful weekly digest of AI and engineering.",
  category: "Technology",
  topics: ["AI", "Engineering"],
  frequency: "weekly",
  timezone: "Asia/Kolkata",
  sipCount: 1,
  sips: [{ title: "AI News", description: "Five meaningful developments.", order: 0 }],
};

class MemoryAuthStore implements AuthStore {
  readonly users = new Map<string, StoredUser>();
  readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();

  async createUser(user: Omit<StoredUser, "id">): Promise<AuthUser> {
    const record = { ...user, id: "reader-1" };
    this.users.set(record.email, record);
    return this.publicUser(record);
  }
  async findUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
  async findUserById(id: string) {
    const user = [...this.users.values()].find((item) => item.id === id);
    return user ? this.publicUser(user) : null;
  }
  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async updateProfile(
    id: string,
    updates: {
      name?: string | undefined;
      emailPreferences?: Partial<AuthUser["emailPreferences"]> | undefined;
    },
  ) {
    const user = [...this.users.values()].find((item) => item.id === id);
    if (!user) return null;
    if (updates.name !== undefined) user.name = updates.name;
    if (updates.emailPreferences) {
      user.emailPreferences = { ...user.emailPreferences, ...updates.emailPreferences };
    }
    return this.publicUser(user);
  }
  private publicUser(user: StoredUser): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailPreferences: user.emailPreferences,
      createdAt: user.createdAt,
    };
  }
}

class MemoryReaderStore implements ReaderStore {
  readonly subscriptions = new Map<string, "active" | "paused" | "unsubscribed">();
  lastFilters: Record<string, unknown> | null = null;

  async listPublicTeaRooms(filters: {
    search?: string | undefined;
    category?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | undefined;
    topic?: string | undefined;
    page: number;
    limit: number;
  }): Promise<TeaRoomPage> {
    this.lastFilters = filters;
    return { items: [teaRoom], total: 1, page: filters.page, limit: filters.limit };
  }
  async findPublicTeaRoom(slug: string) {
    return slug === teaRoom.slug ? teaRoom : null;
  }
  async findPublicTeaRoomById(id: string): Promise<TeaRoomSummary | null> {
    return id === teaRoom.id ? teaRoom : null;
  }
  async listPublishedIssues(
    _teaRoomId: string,
    filters: {
      search?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      page: number;
      limit: number;
    },
  ) {
    this.lastFilters = filters;
    return { items: [issueSummary], total: 1, page: filters.page, limit: filters.limit };
  }
  async getPublishedIssue(id: string): Promise<PublishedIssue | null> {
    return id === issue.id ? issue : null;
  }
  async listSubscriptions(): Promise<ReaderSubscription[]> {
    return [...this.subscriptions.entries()]
      .filter(
        (entry): entry is [string, "active" | "paused"] =>
          entry[1] === "active" || entry[1] === "paused",
      )
      .map(([roomId, status]) => ({
        status,
        createdAt: new Date(),
        teaRoom: { ...teaRoom, id: roomId },
      }));
  }
  async subscribe(_userId: string, teaRoomId: string) {
    const created =
      !this.subscriptions.has(teaRoomId) || this.subscriptions.get(teaRoomId) === "unsubscribed";
    this.subscriptions.set(teaRoomId, "active");
    return { created };
  }
  async setSubscriptionStatus(
    _userId: string,
    teaRoomId: string,
    status: "active" | "paused" | "unsubscribed",
  ) {
    const current = this.subscriptions.get(teaRoomId);
    if (!current || current === "unsubscribed") return false;
    this.subscriptions.set(teaRoomId, status);
    return true;
  }
  async listRecentIssues(): Promise<PublishedIssueSummary[]> {
    return [issueSummary];
  }
  async listUpcomingIssues(): Promise<PublishedIssueSummary[]> {
    return [];
  }
}

const issueSummary: PublishedIssueSummary = {
  id: "tea-1",
  teaRoomId: teaRoom.id,
  teaRoomName: teaRoom.name,
  teaRoomSlug: teaRoom.slug,
  title: "The week in AI",
  publishedAt: new Date("2026-10-30T08:00:00.000Z"),
  sipCount: 1,
  excerpt: "The stories that mattered this week.",
};

const issue: PublishedIssue = {
  ...issueSummary,
  sips: [
    {
      id: "sip-1",
      title: "AI News",
      description: "Five meaningful developments.",
      order: 0,
      content: "A researched update.",
    },
  ],
};

function createReaderApp(authStore = new MemoryAuthStore(), readerStore = new MemoryReaderStore()) {
  const app = createApp(null, authStore, parseEnvironment({ NODE_ENV: "test" }), readerStore);
  return { app, authStore, readerStore };
}

async function createReaderCookie(app: ReturnType<typeof createReaderApp>["app"]): Promise<string> {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "A Reader",
    email: "reader@example.com",
    password: "correct-horse-battery",
  });
  assert.equal(response.status, 201);
  const setCookie = response.headers["set-cookie"]?.[0];
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0]!;
}

test("Tea Room discovery validates and forwards search filters", async () => {
  const { app, readerStore } = createReaderApp();
  const response = await request(app).get("/api/v1/tea-rooms?search=AI&frequency=weekly&page=2");
  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].slug, teaRoom.slug);
  assert.equal(readerStore.lastFilters?.search, "AI");
  assert.equal(readerStore.lastFilters?.page, 2);

  const invalid = await request(app).get("/api/v1/tea-rooms?frequency=yearly");
  assert.equal(invalid.status, 400);
});

test("Tea Room details, archive filters, and published Tea routes return reader content", async () => {
  const { app, readerStore } = createReaderApp();
  const details = await request(app).get("/api/v1/tea-rooms/ai-weekly");
  assert.equal(details.status, 200);
  assert.equal(details.body.teaRoom.sips[0].title, "AI News");

  const archive = await request(app).get(
    "/api/v1/tea-rooms/room-1/issues?from=2026-10-01&to=2026-10-31",
  );
  assert.equal(archive.status, 200);
  assert.equal(readerStore.lastFilters?.from, "2026-10-01");
  assert.equal(archive.body.items[0].title, issue.title);

  const published = await request(app).get("/api/v1/issues/tea-1");
  assert.equal(published.status, 200);
  assert.equal(published.body.tea.sips[0].content, "A researched update.");
  assert.equal((await request(app).get("/api/v1/issues/draft-issue")).status, 404);
});

test("subscriptions require a reader session and support pause, resume, and unsubscribe", async () => {
  const { app, readerStore } = createReaderApp();
  assert.equal((await request(app).post("/api/v1/tea-rooms/room-1/subscribe")).status, 401);
  const cookie = await createReaderCookie(app);

  const subscribed = await request(app)
    .post("/api/v1/tea-rooms/room-1/subscribe")
    .set("Cookie", cookie);
  assert.equal(subscribed.status, 201);
  assert.equal(readerStore.subscriptions.get(teaRoom.id), "active");

  const paused = await request(app).post("/api/v1/tea-rooms/room-1/pause").set("Cookie", cookie);
  assert.equal(paused.body.status, "paused");
  const resumed = await request(app).post("/api/v1/tea-rooms/room-1/resume").set("Cookie", cookie);
  assert.equal(resumed.body.status, "active");

  const following = await request(app).get("/api/v1/users/me/subscriptions").set("Cookie", cookie);
  assert.equal(following.body.subscriptions.length, 1);
  assert.equal(following.body.subscriptions[0].teaRoom.slug, teaRoom.slug);

  const unsubscribe = await request(app)
    .delete("/api/v1/tea-rooms/room-1/subscribe")
    .set("Cookie", cookie);
  assert.equal(unsubscribe.status, 204);
  assert.equal(readerStore.subscriptions.get(teaRoom.id), "unsubscribed");
});
