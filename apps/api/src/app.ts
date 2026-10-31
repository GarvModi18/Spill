import express, { type Express } from "express";
import type { MongoClient } from "mongodb";
import { createLogger } from "@spill/shared/logger";

const logger = createLogger("api");

export function createApp(database: MongoClient | null = null): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

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
