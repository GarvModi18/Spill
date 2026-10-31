export type EmailDeliveryStatus =
  "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed";
export interface EmailDeliveryStore {
  createIndexes(): Promise<void>;
  processProviderEvent(
    providerMessageId: string,
    status: Extract<EmailDeliveryStatus, "delivered" | "bounced" | "complained" | "failed">,
    recipient?: string,
  ): Promise<boolean>;
}
