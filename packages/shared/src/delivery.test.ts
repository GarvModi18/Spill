import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createUnsubscribeToken,
  renderIssueEmail,
  verifyResendWebhook,
  verifyUnsubscribeToken,
} from "./delivery.js";

test("unsubscribe tokens are signed and scoped to a user and Tea Room", () => {
  const token = createUnsubscribeToken("a-secret-key-that-is-long-enough", "reader-1", "room-1");
  assert.deepEqual(verifyUnsubscribeToken("a-secret-key-that-is-long-enough", token), {
    userId: "reader-1",
    teaRoomId: "room-1",
  });
  assert.equal(verifyUnsubscribeToken("different-secret-key-long-enough", token), null);
  assert.equal(verifyUnsubscribeToken("a-secret-key-that-is-long-enough", `${token}x`), null);
});

test("issue email rendering escapes untrusted content in both responsive output versions", () => {
  const rendered = renderIssueEmail({
    roomName: "<Room>",
    issueTitle: "Weekly Tea",
    sections: [{ title: "<AI>", content: "A <script>alert(1)</script> result." }],
    unsubscribeUrl: "https://api.example/unsubscribe?token=x",
    readerUrl: "https://reader.example/tea",
  });
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.text, /A <script>alert\(1\)<\/script> result/);
  assert.match(rendered.html, /Unsubscribe/);
});

test("Resend webhook signature checks the raw request and rejects stale timestamps", () => {
  const secret = `whsec_${Buffer.from("webhook-secret").toString("base64")}`;
  const raw = Buffer.from('{"type":"email.delivered"}');
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${raw.toString("utf8")}`)
    .digest("base64");
  const headers = {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
  assert.equal(verifyResendWebhook(secret, headers, raw), true);
  assert.equal(verifyResendWebhook(secret, { ...headers, "svix-timestamp": "1" }, raw), false);
  assert.equal(verifyResendWebhook(secret, headers, Buffer.from("modified")), false);
});
