import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  READER_WEB_URL: z.string().url().default("http://localhost:5173"),
  ADMIN_WEB_URL: z.string().url().default("http://localhost:5174"),
  API_URL: z.string().url().default("http://localhost:4000"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/spill"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(32).optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["resend", "ses"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  if (result.data.NODE_ENV === "production" && !result.data.AUTH_SECRET) {
    throw new Error("Invalid environment configuration: AUTH_SECRET is required in production");
  }
  return result.data;
}
