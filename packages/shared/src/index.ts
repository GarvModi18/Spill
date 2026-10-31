import { z } from "zod";
export { parseEnvironment } from "./env.js";
export type { Environment } from "./env.js";
export { createLogger } from "./logger.js";
export type { LogLevel } from "./logger.js";

export const userRoleSchema = z.enum(["reader", "admin"]);
export const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(12).max(128),
});
export const loginSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export type UserRole = z.infer<typeof userRoleSchema>;

export const emailPreferencesSchema = z.strictObject({
  teaUpdates: z.boolean(),
  productUpdates: z.boolean(),
});
export const profileUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    emailPreferences: emailPreferencesSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
export type EmailPreferences = z.infer<typeof emailPreferencesSchema>;

export const teaRoomFrequencySchema = z.enum(["daily", "weekly", "monthly"]);

export const teaRoomSearchSchema = z.strictObject({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  frequency: teaRoomFrequencySchema.optional(),
  topic: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export const teaRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(80),
  frequency: teaRoomFrequencySchema,
  timezone: z.string().trim().min(1),
  topics: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  isPublic: z.boolean().default(true),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
});

export type TeaRoom = z.infer<typeof teaRoomSchema>;

const weekdaySchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm time");
export const schedulePointSchema = z.strictObject({
  time: localTimeSchema,
  weekday: weekdaySchema.optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
});
export const teaRoomScheduleSchema = z.strictObject({
  generation: schedulePointSchema,
  reviewDeadline: schedulePointSchema,
  delivery: schedulePointSchema,
});

export const researchSourceSchema = z.strictObject({
  type: z.enum(["web_search", "rss", "github", "hacker_news", "hugging_face"]),
  url: z.url().optional(),
  enabled: z.boolean().default(true),
});

const adminTeaRoomBaseSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(80),
  topics: z.array(z.string().trim().min(1).max(80)).max(30),
  audience: z.string().trim().max(500),
  coverImage: z.union([z.url().refine((url) => /^https?:/.test(url)), z.literal("")]),
  editorialVoice: z.string().trim().max(2000),
  frequency: teaRoomFrequencySchema,
  timezone: z.string().trim().min(1).max(80),
  schedule: teaRoomScheduleSchema,
  defaultResearchSettings: z.strictObject({
    sources: z.array(researchSourceSchema).max(20),
    timeRangeDays: z.number().int().min(1).max(365),
  }),
  emailTemplate: z.string().trim().max(120).default("default"),
  isPublic: z.boolean().default(true),
});

export const adminTeaRoomSchema = adminTeaRoomBaseSchema.superRefine((room, context) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: room.timezone });
  } catch {
    context.addIssue({ code: "custom", path: ["timezone"], message: "Use a valid IANA timezone" });
  }

  const points = [room.schedule.generation, room.schedule.reviewDeadline, room.schedule.delivery];
  points.forEach((point, index) => {
    const path = ["schedule", ["generation", "reviewDeadline", "delivery"][index]!];
    if (room.frequency === "daily" && (point.weekday || point.dayOfMonth !== undefined)) {
      context.addIssue({ code: "custom", path, message: "Daily schedule points only need a time" });
    }
    if (room.frequency === "weekly" && (!point.weekday || point.dayOfMonth !== undefined)) {
      context.addIssue({ code: "custom", path, message: "Weekly schedule points need a weekday" });
    }
    if (room.frequency === "monthly" && (point.dayOfMonth === undefined || point.weekday)) {
      context.addIssue({
        code: "custom",
        path,
        message: "Monthly schedule points need a day of month",
      });
    }
  });

  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (room.frequency === "daily") {
    if (minutes(room.schedule.generation.time) > minutes(room.schedule.reviewDeadline.time)) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "reviewDeadline"],
        message: "Review must follow generation",
      });
    }
    if (minutes(room.schedule.reviewDeadline.time) > minutes(room.schedule.delivery.time)) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "delivery"],
        message: "Delivery must follow the review deadline",
      });
    }
  }
  if (room.frequency === "weekly" || room.frequency === "monthly") {
    const dayIndex = (point: z.infer<typeof schedulePointSchema>) =>
      room.frequency === "weekly"
        ? weekdaySchema.options.indexOf(point.weekday as (typeof weekdaySchema.options)[number])
        : (point.dayOfMonth ?? 1) - 1;
    const cycleLength = room.frequency === "weekly" ? 7 * 24 * 60 : 28 * 24 * 60;
    const sequence = points.map((point) => dayIndex(point) * 24 * 60 + minutes(point.time));
    while (sequence[1]! <= sequence[0]!) sequence[1]! += cycleLength;
    while (sequence[2]! <= sequence[1]!) sequence[2]! += cycleLength;
    if (sequence[2]! >= sequence[0]! + cycleLength) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "delivery"],
        message: "Delivery must follow review before the next cycle",
      });
    }
  }
});

export const adminTeaRoomPatchSchema = adminTeaRoomBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one Tea Room field is required");
export type AdminTeaRoom = z.infer<typeof adminTeaRoomBaseSchema>;

export const researchSourceTypeSchema = researchSourceSchema.shape.type;

export const sipConfigSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  type: z.enum([
    "top_n",
    "latest_news",
    "trending",
    "company_updates",
    "comparison",
    "research_summary",
    "tutorial",
    "deals",
    "market_update",
    "editorial",
  ]),
  itemCount: z.number().int().min(1).max(20),
  instructions: z.string().trim().min(1).max(5000),
  order: z.number().int().nonnegative(),
  researchSources: z.array(researchSourceSchema).max(20).default([]),
  timeRangeDays: z.number().int().min(1).max(365).default(7),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  writingStyle: z.string().trim().min(1).max(500).default("Clear and curious"),
  contentLength: z.enum(["short", "medium", "long"]).default("medium"),
});

export type SipConfig = z.infer<typeof sipConfigSchema>;
export const sipConfigCreateSchema = sipConfigSchema.omit({ order: true });
export const sipConfigPatchSchema = sipConfigSchema
  .omit({ order: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one Sip field is required");
