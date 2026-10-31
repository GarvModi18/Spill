import express, { type Express } from "express";
import cors from "cors";
import type { MongoClient } from "mongodb";
import { createLogger, parseEnvironment } from "@spill/shared";
import type { Environment } from "@spill/shared";
import { createAuthRouter } from "./auth/routes.js";
import { MongoAuthStore } from "./auth/mongo-store.js";
import type { AuthStore } from "./auth/types.js";

const logger = createLogger("api");

export function createApp(
  database: MongoClient | null = null,
  authStore?: AuthStore,
  environment: Environment = parseEnvironment(),
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: [environment.READER_WEB_URL, environment.ADMIN_WEB_URL],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  const resolvedAuthStore = authStore ?? (database ? new MongoAuthStore(database.db()) : null);
  if (resolvedAuthStore) app.use("/api/v1", createAuthRouter(resolvedAuthStore, environment));

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response) => {
    if (!database) {
      response.status(503).json({ status: "not_ready", dependencies: { mongodb: "disconnected" } });
      return;
    }
    try {
      await database.db().command({ ping: 1 });
      response.status(200).json({ status: "ok", dependencies: { mongodb: "connected" } });
    } catch (error) {
      logger.error("Database readiness check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(503).json({ status: "not_ready", dependencies: { mongodb: "unavailable" } });
    }
  });

  return app;
}
