import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "./env.js";
import { adminTeaRoomSchema, sipConfigSchema, teaRoomSchema } from "./index.js";

const validAdminTeaRoom = {
  name: "AI Weekly",
  slug: "ai-weekly",
  description: "A weekly AI digest.",
  category: "Technology",
  topics: ["AI"],
  audience: "People building with AI",
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
} as const;

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

test("Admin Tea Room schema accepts a complete scheduled configuration", () => {
  assert.equal(adminTeaRoomSchema.safeParse(validAdminTeaRoom).success, true);
});

test("Admin Tea Room schema rejects invalid timezones and out-of-order schedules", () => {
  assert.equal(
    adminTeaRoomSchema.safeParse({
      ...validAdminTeaRoom,
      timezone: "Not/A-Timezone",
    }).success,
    false,
  );
  assert.equal(
    adminTeaRoomSchema.safeParse({
      ...validAdminTeaRoom,
      schedule: {
        ...validAdminTeaRoom.schedule,
        reviewDeadline: { time: "18:00", weekday: "Monday" },
      },
    }).success,
    false,
  );
});

test("environment parsing applies defaults and rejects invalid configuration", () => {
  assert.equal(parseEnvironment({}).PORT, 4000);
  assert.equal(parseEnvironment({}).TRUST_PROXY_HOPS, 0);
  assert.equal(parseEnvironment({}).API_RATE_LIMIT_MAX, 3000);
  assert.throws(() => parseEnvironment({ API_RATE_LIMIT_MAX: "0" }), /API_RATE_LIMIT_MAX/);
  assert.throws(() => parseEnvironment({ PORT: "not-a-port" }), /PORT/);
  assert.throws(() => parseEnvironment({ NODE_ENV: "production" }), /AUTH_SECRET/);
});
