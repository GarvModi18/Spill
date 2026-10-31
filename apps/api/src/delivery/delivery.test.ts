import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { parseEnvironment } from "@spill/shared";
import { createUnsubscribeToken } from "@spill/shared/delivery";
import type { AuthStore } from "../auth/types.js";
import type { ReaderStore } from "../reader/types.js";
import { createApp } from "../app.js";
import type { EmailDeliveryStore } from "./types.js";

test("one-click unsubscribe verifies its signature and updates only the scoped subscription", async () => {
  const secret = "an-unsubscribe-secret-long-enough";
  let changed: unknown[] = [];
  const readerStore = {
    setSubscriptionStatus: async (...args: unknown[]) => {
      changed = args;
      return true;
    },
  } as unknown as ReaderStore;
  const environment = parseEnvironment({ ...process.env, UNSUBSCRIBE_SECRET: secret });
  const app = createApp(null, {} as AuthStore, environment, readerStore);
  const token = createUnsubscribeToken(secret, "reader-1", "room-1");
  const response = await request(app).post("/api/v1/unsubscribe").send({ token });
  assert.equal(response.status, 200);
  assert.deepEqual(changed, ["reader-1", "room-1", "unsubscribed"]);
  const invalid = await request(app)
    .post("/api/v1/unsubscribe")
    .send({ token: `${token}bad` });
  assert.equal(invalid.status, 400);
  const oneClick = await request(app)
    .post(`/api/v1/unsubscribe?token=${encodeURIComponent(token)}`)
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send("List-Unsubscribe=One-Click");
  assert.equal(oneClick.status, 200);
});

test("Resend webhook only updates deliveries when the signed raw body is valid", async () => {
  const secret = `whsec_${Buffer.from("hook-secret").toString("base64")}`;
  let processed: unknown[] = [];
  const deliveryStore = {
    processProviderEvent: async (...args: unknown[]) => {
      processed = args;
      return true;
    },
  } as unknown as EmailDeliveryStore;
  const environment = parseEnvironment({ ...process.env, RESEND_WEBHOOK_SECRET: secret });
  const app = createApp(
    null,
    {} as AuthStore,
    environment,
    undefined,
    undefined,
    undefined,
    null,
    null,
    undefined,
    null,
    undefined,
    undefined,
    null,
    deliveryStore,
  );
  const raw = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "email_123", to: ["reader@example.com"] },
  });
  const id = "evt_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  const headers = {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
  const success = await request(app)
    .post("/api/v1/webhooks/resend")
    .set(headers)
    .set("Content-Type", "application/json")
    .send(raw);
  assert.equal(success.status, 204);
  assert.deepEqual(processed, ["email_123", "delivered", "reader@example.com"]);
  const invalid = await request(app)
    .post("/api/v1/webhooks/resend")
    .set({ ...headers, "svix-signature": "v1,bad" })
    .set("Content-Type", "application/json")
    .send(raw);
  assert.equal(invalid.status, 401);
});
