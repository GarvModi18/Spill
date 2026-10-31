import { ObjectId, type Db } from "mongodb";
import type { GenerationResult, GenerationRoom } from "@spill/ai";
import type { GenerationStore } from "./types.js";

export class MongoGenerationStore implements GenerationStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database
        .collection("newsletterIssues")
        .createIndex({ teaRoomId: 1, status: 1, createdAt: -1 }),
      this.database
        .collection("newsletterIssues")
        .createIndex(
          { teaRoomId: 1, generationKey: 1 },
          { unique: true, partialFilterExpression: { generationKey: { $exists: true } } },
        ),
      this.database.collection("issueSips").createIndex({ issueId: 1, order: 1 }, { unique: true }),
      this.database.collection("researchSources").createIndex({ issueId: 1, sipId: 1 }),
    ]);
  }

  async start(teaRoom: GenerationRoom, requestedBy: string): Promise<string> {
    const issueId = new ObjectId();
    const now = new Date();
    await this.database.collection("newsletterIssues").insertOne({
      _id: issueId,
      teaRoomId: new ObjectId(teaRoom.id),
      title: `${teaRoom.name} · ${now.toISOString().slice(0, 10)}`,
      status: "generating",
      createdAt: now,
      updatedAt: now,
      createdBy: new ObjectId(requestedBy),
      generationStartedAt: now,
      generationRunId: issueId.toHexString(),
    });
    return issueId.toHexString();
  }

  async complete(issueId: string, result: GenerationResult): Promise<void> {
    const id = new ObjectId(issueId);
    const now = new Date(result.completedAt);
    const issues = this.database.collection("newsletterIssues");
    await issues.updateOne(
      { _id: id, status: "generating" },
      {
        $set: {
          status: result.status,
          updatedAt: now,
          generationCompletedAt: now,
          generationSummary: {
            totalSips: result.sips.length,
            failedSips: result.sips.filter((sip) => sip.status === "failed").length,
          },
        },
      },
    );
    if (!result.sips.length) return;
    const sipCollection = this.database.collection("issueSips");
    const sipDocuments = result.sips.map((sip) => ({
      _id: new ObjectId(),
      issueId: id,
      sipId: new ObjectId(sip.sipId),
      title: sip.title,
      description: sip.description,
      order: sip.order,
      status: sip.status,
      content: sip.content,
      items: sip.items,
      qualityIssues: sip.qualityIssues,
      error: sip.error,
      modelVersion: sip.modelVersion,
      promptVersion: sip.promptVersion,
      attempts: sip.attempts,
      updatedAt: now,
      version: 1,
    }));
    await sipCollection.insertMany(sipDocuments);
    await this.database.collection("issueSipVersions").insertMany(
      sipDocuments.map((sip) => ({
        _id: new ObjectId(),
        issueId: id,
        issueSipId: sip._id,
        version: 1,
        title: sip.title,
        content: sip.content,
        changedBy: null,
        reason: "generation",
        createdAt: now,
      })),
    );
    const receipts = result.sips.flatMap((sip) =>
      sip.receipts.map((receipt) => ({
        ...receipt,
        _id: new ObjectId(),
        issueId: id,
        sipId: new ObjectId(sip.sipId),
        retrievedAt: new Date(receipt.retrievedAt),
        publishedAt: receipt.publishedAt ? new Date(receipt.publishedAt) : null,
      })),
    );
    if (receipts.length) await this.database.collection("researchSources").insertMany(receipts);
  }

  async fail(issueId: string, error: string): Promise<void> {
    await this.database.collection("newsletterIssues").updateOne(
      { _id: new ObjectId(issueId), status: "generating" },
      {
        $set: { status: "generation_failed", error: error.slice(0, 500), updatedAt: new Date() },
      },
    );
  }
}
