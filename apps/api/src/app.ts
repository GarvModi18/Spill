import express, { type Express } from "express";
import cors from "cors";
import type { MongoClient } from "mongodb";
import { createLogger, parseEnvironment } from "@spill/shared";
import type { Environment } from "@spill/shared";
import { createAuthRouter } from "./auth/routes.js";
import { MongoAuthStore } from "./auth/mongo-store.js";
import type { AuthStore } from "./auth/types.js";
import { createReaderRouter } from "./reader/routes.js";
import { MongoReaderStore } from "./reader/mongo-store.js";
import type { ReaderStore } from "./reader/types.js";
import { createAdminRouter } from "./admin/routes.js";
import { MongoAdminStore } from "./admin/mongo-store.js";
import type { AdminStore } from "./admin/types.js";
import type { ConciergeGraph } from "@spill/ai";
import { MongoConciergeStore } from "./concierge/mongo-store.js";
import type { ConciergeStore } from "./concierge/types.js";
import type { ResearchService } from "@spill/ai";
import { MongoResearchStore } from "./research/mongo-store.js";
import type { ResearchStore } from "./research/types.js";
import { MongoGenerationStore } from "./generation/mongo-store.js";
import type { GenerationGraph } from "@spill/ai";
import type { GenerationStore } from "./generation/types.js";
import { MongoIssueStore } from "./issues/mongo-store.js";
import type { IssueStore } from "./issues/types.js";
import type { Queue } from "bullmq";
import type { DeliveryJob } from "./delivery/queue.js";
import { MongoEmailDeliveryStore } from "./delivery/mongo-store.js";
import type { EmailDeliveryStore } from "./delivery/types.js";
import { createUnsubscribeRouter, createResendWebhookRouter } from "./delivery/routes.js";
import { ResendEmailSender } from "@spill/shared/email";

const logger = createLogger("api");

export function createApp(
  database: MongoClient | null = null,
  authStore?: AuthStore,
  environment: Environment = parseEnvironment(),
  readerStore?: ReaderStore,
  adminStore?: AdminStore,
  conciergeStore?: ConciergeStore,
  conciergeGraph: ConciergeGraph | null = null,
  researchService?: ResearchService | null,
  researchStore?: ResearchStore,
  generationGraph?: GenerationGraph | null,
  generationStore?: GenerationStore,
  issueStore?: IssueStore,
  deliveryQueue?: Queue<DeliveryJob> | null,
  emailDeliveryStore?: EmailDeliveryStore,
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: [environment.READER_WEB_URL, environment.ADMIN_WEB_URL],
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: "1mb",
      verify: (request, _response, buffer) => {
        request.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  const resolvedAuthStore = authStore ?? (database ? new MongoAuthStore(database.db()) : null);
  const emailSender =
    environment.RESEND_API_KEY && environment.EMAIL_FROM
      ? new ResendEmailSender(environment.RESEND_API_KEY, environment.EMAIL_FROM)
      : null;
  if (resolvedAuthStore)
    app.use("/api/v1", createAuthRouter(resolvedAuthStore, environment, emailSender));
  const resolvedReaderStore =
    readerStore ?? (database ? new MongoReaderStore(database.db()) : null);
  if (resolvedReaderStore && resolvedAuthStore) {
    app.use("/api/v1", createReaderRouter(resolvedReaderStore, resolvedAuthStore));
  }
  const resolvedAdminStore = adminStore ?? (database ? new MongoAdminStore(database.db()) : null);
  const resolvedConciergeStore =
    conciergeStore ?? (database ? new MongoConciergeStore(database.db()) : null);
  const resolvedResearchStore =
    researchStore ?? (database ? new MongoResearchStore(database.db()) : null);
  const resolvedGenerationStore =
    generationStore ?? (database ? new MongoGenerationStore(database.db()) : null);
  const resolvedIssueStore = issueStore ?? (database ? new MongoIssueStore(database.db()) : null);
  const resolvedEmailDeliveryStore =
    emailDeliveryStore ?? (database ? new MongoEmailDeliveryStore(database.db()) : null);
  if (resolvedReaderStore)
    app.use("/api/v1/unsubscribe", createUnsubscribeRouter(resolvedReaderStore, environment));
  if (resolvedEmailDeliveryStore)
    app.use(
      "/api/v1/webhooks/resend",
      createResendWebhookRouter(resolvedEmailDeliveryStore, environment),
    );
  if (resolvedAdminStore && resolvedAuthStore) {
    app.use(
      "/api/v1/admin",
      createAdminRouter(
        resolvedAdminStore,
        resolvedAuthStore,
        resolvedConciergeStore,
        conciergeGraph,
        researchService ?? null,
        resolvedResearchStore,
        generationGraph ?? null,
        resolvedGenerationStore,
        resolvedIssueStore,
        deliveryQueue ?? null,
      ),
    );
  }

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
