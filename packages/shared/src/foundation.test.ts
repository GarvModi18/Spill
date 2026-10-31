import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "./env.js";
import { sipConfigSchema, teaRoomSchema } from "./index.js";

test("Tea Room schema accepts a valid configuration and defaults public visibility", () => {
  const parsed = teaRoomSchema.parse({
    name: "AI Weekly",
    slug: "ai-weekly",
    description: "A weekly AI digest.",
    category: "Technology",
    frequency: "weekly",
    timezone: "Asia/Kolkata",
  });
  assert.equal(parsed.isPublic, true);
});

test("Tea Room schema rejects malformed slugs", () => {
  assert.equal(
    teaRoomSchema.safeParse({
      name: "AI Weekly",
      slug: "AI Weekly!",
      description: "A weekly AI digest.",
      category: "Technology",
      frequency: "weekly",
      timezone: "Asia/Kolkata",
    }).success,
    false,
  );
});

test("Sip schema enforces bounded item counts", () => {
  const result = sipConfigSchema.safeParse({
    title: "News",
    description: "Latest stories",
    type: "latest_news",
    itemCount: 0,
    instructions: "Use primary sources",
    order: 0,
  });
  assert.equal(result.success, false);
});

test("environment parsing applies defaults and rejects invalid configuration", () => {
  assert.equal(parseEnvironment({}).PORT, 4000);
  assert.throws(() => parseEnvironment({ PORT: "not-a-port" }), /PORT/);
  assert.throws(() => parseEnvironment({ NODE_ENV: "production" }), /AUTH_SECRET/);
});
