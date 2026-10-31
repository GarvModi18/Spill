export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}
export interface EmailSendResult {
  messageId: string;
}
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
    const id =
      typeof body === "object" && body !== null && "id" in body && typeof body.id === "string"
        ? body.id
        : "";
    if (!id) throw new Error("Email provider did not return a message id");
    return { messageId: id };
  }
}
