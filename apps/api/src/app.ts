import express, { type Express } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
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
  app.set("trust proxy", environment.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const startedAt = performance.now();
    const suppliedId = request.header("x-request-id");
    const requestId = suppliedId && /^[A-Za-z0-9._-]{1,64}$/.test(suppliedId) ? suppliedId : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; style-src 'self'");
    if (environment.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.on("finish", () => logger.info("HTTP request completed", {
      requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    next();
  });
  app.use(rateLimit({
    windowMs: 60_000,
    limit: environment.API_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (request) => request.path.startsWith("/health/") || request.path.startsWith("/api/v1/webhooks/"),
  }));
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
    const dependencies: Record<string, string> = {};
    try {
      await database.db().command({ ping: 1 });
      dependencies.mongodb = "connected";
    } catch (error) {
      logger.error("Database readiness check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(503).json({ status: "not_ready", dependencies: { mongodb: "unavailable" } });
      return;
    }
    if (deliveryQueue) {
      try {
        await deliveryQueue.getJobCounts();
        dependencies.redis = "connected";
      } catch (error) {
        logger.error("Redis readiness check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        response.status(503).json({ status: "not_ready", dependencies: { ...dependencies, redis: "unavailable" } });
        return;
      }
    }
    response.status(200).json({ status: "ok", dependencies });
  });

  return app;
}
