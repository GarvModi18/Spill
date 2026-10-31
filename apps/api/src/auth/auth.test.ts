import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { createApp } from "../app.js";
import { hashPassword } from "./password.js";
import type { AuthStore, AuthUser, StoredUser } from "./types.js";

class MemoryAuthStore implements AuthStore {
  users = new Map<string, StoredUser>();
  sessions = new Map<string, { userId: string; expiresAt: Date }>();

  async createUser(user: Omit<StoredUser, "id">): Promise<AuthUser> {
    if (this.users.has(user.email)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const record = {
      ...user,
      emailPreferences: user.emailPreferences ?? { teaUpdates: true, productUpdates: false },
      id: `user-${this.users.size + 1}`,
    };
    this.users.set(user.email, record);
    return this.publicUser(record);
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.users.get(email) ?? null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    return user ? this.publicUser(user) : null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async updateProfile(
    id: string,
    updates: {
      name?: string | undefined;
      emailPreferences?: Partial<AuthUser["emailPreferences"]> | undefined;
    },
  ): Promise<AuthUser | null> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) return null;
    if (updates.name) user.name = updates.name;
    if (updates.emailPreferences)
      user.emailPreferences = { ...user.emailPreferences, ...updates.emailPreferences };
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

function appFor(store: AuthStore) {
  return createApp(null, store, parseEnvironment({ NODE_ENV: "test" }));
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers["set-cookie"];
  assert.ok(setCookie);
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(cookie);
  return cookie.split(";", 1)[0]!;
}

test("registration creates a reader and issues an HttpOnly session cookie", async () => {
  const store = new MemoryAuthStore();
  const response = await request(appFor(store)).post("/api/v1/auth/register").send({
    name: "A Reader",
    email: "reader@example.com",
    password: "correct-horse-battery",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "reader");
  assert.equal(response.body.user.passwordHash, undefined);
  const cookieHeader = response.headers["set-cookie"]?.[0];
  assert.ok(cookieHeader);
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Lax/);
  assert.notEqual(store.users.get("reader@example.com")?.passwordHash, "correct-horse-battery");
  assert.equal(store.sessions.size, 1);
});

test("registration rejects attempts to assign a role", async () => {
  const store = new MemoryAuthStore();
  const response = await request(appFor(store)).post("/api/v1/auth/register").send({
    name: "Attacker",
    email: "attacker@example.com",
    password: "correct-horse-battery",
    role: "admin",
  });
  assert.equal(response.status, 400);
  assert.equal(store.users.size, 0);
});

test("login validates credentials and returns a new session", async () => {
  const store = new MemoryAuthStore();
  await store.createUser({
    name: "A Reader",
    email: "reader@example.com",
    passwordHash: await hashPassword("correct-horse-battery"),
    role: "reader",
    emailPreferences: { teaUpdates: true, productUpdates: false },
    createdAt: new Date(),
  });
  const invalid = await request(appFor(store)).post("/api/v1/auth/login").send({
    email: "reader@example.com",
    password: "wrong-password",
  });
  assert.equal(invalid.status, 401);

  const valid = await request(appFor(store)).post("/api/v1/auth/login").send({
    email: "reader@example.com",
    password: "correct-horse-battery",
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.user.role, "reader");
  assert.equal(store.sessions.size, 1);
});

test("protected profile needs authentication and returns no password data", async () => {
  const store = new MemoryAuthStore();
  const app = appFor(store);
  const anonymous = await request(app).get("/api/v1/users/me");
  assert.equal(anonymous.status, 401);

  const registration = await request(app).post("/api/v1/auth/register").send({
    name: "A Reader",
    email: "reader@example.com",
    password: "correct-horse-battery",
  });
  const profile = await request(app)
    .get("/api/v1/users/me")
    .set("Cookie", cookieFrom(registration));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, "reader@example.com");
  assert.equal(profile.body.user.passwordHash, undefined);
});

test("profile updates allow name and delivery preferences without changing email or role", async () => {
  const store = new MemoryAuthStore();
  const app = appFor(store);
  const registration = await request(app).post("/api/v1/auth/register").send({
    name: "A Reader",
    email: "reader@example.com",
    password: "correct-horse-battery",
  });
  const updated = await request(app)
    .patch("/api/v1/users/me")
    .set("Cookie", cookieFrom(registration))
    .send({ name: "Tea Lover", emailPreferences: { productUpdates: true } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.name, "Tea Lover");
  assert.equal(updated.body.user.email, "reader@example.com");
  assert.deepEqual(updated.body.user.emailPreferences, { teaUpdates: true, productUpdates: true });
  assert.equal(updated.body.user.role, "reader");

  const forbidden = await request(app)
    .patch("/api/v1/users/me")
    .set("Cookie", cookieFrom(registration))
    .send({ role: "admin" });
  assert.equal(forbidden.status, 400);
});

test("reader sessions cannot access admin routes", async () => {
  const store = new MemoryAuthStore();
  const registration = await request(appFor(store)).post("/api/v1/auth/register").send({
    name: "A Reader",
    email: "reader@example.com",
    password: "correct-horse-battery",
  });
  const response = await request(appFor(store))
    .get("/api/v1/admin/me")
    .set("Cookie", cookieFrom(registration));
  assert.equal(response.status, 403);
});

test("admin sessions can access admin routes and logout revokes the session", async () => {
  const store = new MemoryAuthStore();
  await store.createUser({
    name: "Admin",
    email: "admin@example.com",
    passwordHash: await hashPassword("correct-horse-battery"),
    role: "admin",
    emailPreferences: { teaUpdates: true, productUpdates: false },
    createdAt: new Date(),
  });
  const app = appFor(store);
  const login = await request(app).post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "correct-horse-battery",
  });
  const cookie = cookieFrom(login);
  const authorized = await request(app).get("/api/v1/admin/me").set("Cookie", cookie);
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.user.role, "admin");

  const logout = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
  assert.equal(logout.status, 204);
  const revoked = await request(app).get("/api/v1/admin/me").set("Cookie", cookie);
  assert.equal(revoked.status, 401);
});
