import { Router } from "express";
import { verifyResendWebhook, verifyUnsubscribeToken } from "@spill/shared/delivery";
import type { Environment } from "@spill/shared";
import type { ReaderStore } from "../reader/types.js";
import type { EmailDeliveryStore } from "./types.js";

export function createUnsubscribeRouter(readerStore: ReaderStore, environment: Environment) {
  const router = Router();
  const secret = environment.UNSUBSCRIBE_SECRET ?? environment.AUTH_SECRET;
  router.get("/", (request, response) => {
    const token = typeof request.query.token === "string" ? request.query.token : "";
    if (!secret || !verifyUnsubscribeToken(secret, token)) {
      response.status(400).send("This unsubscribe link is invalid.");
      return;
    }
    response
      .type("html")
      .send(
        `<!doctype html><html><body><h1>Unsubscribe from this Tea Room?</h1><form method="post" action="/api/v1/unsubscribe"><input type="hidden" name="token" value="${token.replace(/[&<>"']/g, "")}"><button>Unsubscribe</button></form></body></html>`,
      );
  });
  router.post("/", async (request, response, next) => {
    const token =
      typeof request.body?.token === "string"
        ? request.body.token
        : typeof request.query.token === "string"
          ? request.query.token
          : "";
    if (!secret) {
      response.status(503).json({ error: "Unsubscribe service is unavailable" });
      return;
    }
    const identity = verifyUnsubscribeToken(secret, token);
    if (!identity) {
      response.status(400).json({ error: "Invalid unsubscribe link" });
      return;
    }
    try {
      await readerStore.setSubscriptionStatus(identity.userId, identity.teaRoomId, "unsubscribed");
      response.status(200).json({ status: "unsubscribed" });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function createResendWebhookRouter(store: EmailDeliveryStore, environment: Environment) {
  const router = Router();
  router.post("/", async (request, response, next) => {
    const raw = request.rawBody;
    const secret = environment.RESEND_WEBHOOK_SECRET;
    if (
      !secret ||
      !raw ||
      !verifyResendWebhook(
        secret,
        {
          "svix-id": request.header("svix-id"),
          "svix-timestamp": request.header("svix-timestamp"),
          "svix-signature": request.header("svix-signature"),
        },
        raw,
      )
    ) {
      response.status(401).json({ error: "Invalid provider signature" });
      return;
    }
    const body = request.body as {
      type?: string;
      data?: { email_id?: string; id?: string; to?: string[] };
    };
    const eventStatus =
      body.type === "email.delivered"
        ? "delivered"
        : body.type === "email.bounced"
          ? "bounced"
          : body.type === "email.complained"
            ? "complained"
            : body.type === "email.failed"
              ? "failed"
              : null;
    const messageId = body.data?.email_id ?? body.data?.id;
    if (!eventStatus || !messageId) {
      response.status(204).end();
      return;
    }
    try {
      await store.processProviderEvent(messageId, eventStatus, body.data?.to?.[0]);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  return router;
}
