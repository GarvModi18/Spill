import { createHmac, timingSafeEqual } from "node:crypto";

export interface IssueEmailSection {
  title: string;
  content: string;
}
export interface RenderedIssueEmail {
  html: string;
  text: string;
}

export function createUnsubscribeToken(secret: string, userId: string, teaRoomId: string): string {
  const payload = Buffer.from(`${userId}.${teaRoomId}`).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { userId: string; teaRoomId: string } | null {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const [userId, teaRoomId, ...tail] = decoded.split(".");
    if (!userId || !teaRoomId || tail.length) return null;
    return { userId, teaRoomId };
  } catch {
    return null;
  }
}

export function renderIssueEmail(input: {
  roomName: string;
  issueTitle: string;
  sections: IssueEmailSection[];
  unsubscribeUrl: string;
  readerUrl: string;
}): RenderedIssueEmail {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
    );
  const htmlSections = input.sections
    .map(
      (section) =>
        `<section style="margin:28px 0"><h2 style="font-size:20px">${escape(section.title)}</h2>${section.content
          .split(/\n\s*\n/)
          .map(
            (paragraph) =>
              `<p style="line-height:1.65">${escape(paragraph).replace(/\n/g, "<br>")}</p>`,
          )
          .join("")}</section>`,
    )
    .join("");
  const textSections = input.sections
    .map((section) => `${section.title}\n${section.content}`)
    .join("\n\n");
  return {
    html: `<!doctype html><html><body style="margin:0;background:#f7f3ed;color:#292720;font-family:Arial,sans-serif"><main style="max-width:640px;margin:0 auto;padding:32px 20px;background:#fffdf9"><p style="color:#777">${escape(input.roomName)}</p><h1>${escape(input.issueTitle)}</h1>${htmlSections}<p><a href="${escape(input.readerUrl)}">Read this Tea online</a></p><hr><p style="font-size:12px;color:#777">You received this because you follow ${escape(input.roomName)}. <a href="${escape(input.unsubscribeUrl)}">Unsubscribe</a></p></main></body></html>`,
    text: `${input.roomName}\n${input.issueTitle}\n\n${textSections}\n\nRead online: ${input.readerUrl}\nUnsubscribe: ${input.unsubscribeUrl}`,
  };
}

export function verifyResendWebhook(
  secret: string,
  headers: Record<string, string | undefined>,
  body: Buffer,
  now = Date.now(),
): boolean {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signatures = headers["svix-signature"];
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  const timestampNumber = Number(timestamp) * 1000;
  if (Math.abs(now - timestampNumber) > 5 * 60_000) return false;
  const signingSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(signingSecret, "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body.toString("utf8")}`)
    .digest();
  return signatures.split(" ").some((entry) => {
    const [version, encoded] = entry.split(",");
    if (version !== "v1" || !encoded) return false;
    const actual = Buffer.from(encoded, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
