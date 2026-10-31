import { ObjectId, type Db } from "mongodb";
import type { ResearchReceipt } from "@spill/shared";
import type { ResearchSearchResult } from "@spill/ai";
import type { ResearchRunInput, ResearchStore, StoredResearchRun } from "./types.js";

export class MongoResearchStore implements ResearchStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database.collection("researchRuns").createIndex({ sipId: 1, startedAt: -1 }),
      this.database
        .collection("researchSources")
        .createIndex({ researchRunId: 1, url: 1 }, { unique: true }),
      this.database.collection("researchSources").createIndex({ sipId: 1, retrievedAt: -1 }),
    ]);
  }

  async save(input: ResearchRunInput, result: ResearchSearchResult): Promise<StoredResearchRun> {
    const id = new ObjectId();
    const startedAt = result.retrievedAt;
    const finishedAt = new Date().toISOString();
    const status =
      result.receipts.length === 0
        ? result.failures.length
          ? "failed"
          : "completed"
        : result.failures.length
          ? "partial"
          : "completed";
    const run: StoredResearchRun = {
      ...input,
      id: id.toHexString(),
      status,
      startedAt,
      finishedAt,
      receiptCount: result.receipts.length,
      failures: result.failures,
    };
    await this.database.collection("researchRuns").insertOne({
      _id: id,
      teaRoomId: new ObjectId(input.teaRoomId),
      sipId: new ObjectId(input.sipId),
      requestedBy: new ObjectId(input.requestedBy),
      query: input.query,
      status,
      startedAt: new Date(startedAt),
      finishedAt: new Date(finishedAt),
      receiptCount: result.receipts.length,
      failures: result.failures,
    });
    if (result.receipts.length) {
      await this.database.collection("researchSources").insertMany(
        result.receipts.map((receipt: ResearchReceipt) => ({
          ...receipt,
          _id: new ObjectId(),
          researchRunId: id,
          teaRoomId: new ObjectId(input.teaRoomId),
          sipId: new ObjectId(input.sipId),
          query: input.query,
          requestedBy: new ObjectId(input.requestedBy),
          publishedAt: receipt.publishedAt ? new Date(receipt.publishedAt) : null,
          retrievedAt: new Date(receipt.retrievedAt),
        })),
      );
    }
    return run;
  }
}
