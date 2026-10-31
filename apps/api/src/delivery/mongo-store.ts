import { type Db } from "mongodb";
import type { EmailDeliveryStatus, EmailDeliveryStore } from "./types.js";

interface DeliveryDocument {
  providerMessageId?: string;
  issueId: import("mongodb").ObjectId;
  userId: import("mongodb").ObjectId;
  email: string;
  status: EmailDeliveryStatus;
}

export class MongoEmailDeliveryStore implements EmailDeliveryStore {
  constructor(private readonly database: Db) {}
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database
        .collection("emailDeliveries")
        .createIndex({ issueId: 1, userId: 1 }, { unique: true }),
      this.database
        .collection("emailDeliveries")
        .createIndex({ providerMessageId: 1 }, { unique: true, sparse: true }),
      this.database.collection("emailDeliveries").createIndex({ issueId: 1, status: 1 }),
      this.database.collection("emailSuppressions").createIndex({ email: 1 }, { unique: true }),
    ]);
  }
  async processProviderEvent(
    providerMessageId: string,
    status: Extract<EmailDeliveryStatus, "delivered" | "bounced" | "complained" | "failed">,
    recipient?: string,
  ): Promise<boolean> {
    const collection = this.database.collection<DeliveryDocument>("emailDeliveries");
    const delivery = await collection.findOneAndUpdate(
      { providerMessageId },
      {
        $set: {
          status,
          updatedAt: new Date(),
          ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
        },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!delivery) return false;
    const email = (recipient ?? delivery.email).toLowerCase();
    if (status === "bounced" || status === "complained") {
      await this.database.collection("emailSuppressions").updateOne(
        { email },
        {
          $set: { status, updatedAt: new Date() },
          $setOnInsert: { email, createdAt: new Date() },
        },
        { upsert: true },
      );
    }
    return true;
  }
}
