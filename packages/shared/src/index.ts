import { z } from "zod";
export { parseEnvironment } from "./env.js";
export type { Environment } from "./env.js";
export { createLogger } from "./logger.js";
export type { LogLevel } from "./logger.js";

export const teaRoomFrequencySchema = z.enum(["daily", "weekly", "monthly"]);

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
  isPublic: z.boolean().default(true),
});

export type TeaRoom = z.infer<typeof teaRoomSchema>;

export const sipConfigSchema = z.object({
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
});

export type SipConfig = z.infer<typeof sipConfigSchema>;
