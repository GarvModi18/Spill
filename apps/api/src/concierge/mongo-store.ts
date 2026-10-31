import { randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { ConciergeReply } from "@spill/shared";
import type {
  ConciergeMessage,
  ConciergeSession,
  ConciergeStore,
  StoredProposal,
} from "./types.js";

interface ConciergeDocument {
  _id: ObjectId;
  userId: ObjectId;
  threadId: string;
  title: string;
  messages: ConciergeMessage[];
  pendingProposal: StoredProposal | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSession(document: ConciergeDocument): ConciergeSession {
  return {
    threadId: document.threadId,
    title: document.title,
    messages: document.messages,
    pendingProposal: document.pendingProposal,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export class MongoConciergeStore implements ConciergeStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await this.database
      .collection<ConciergeDocument>("chatSessions")
      .createIndex({ userId: 1, threadId: 1 }, { unique: true });
    await this.database
      .collection<ConciergeDocument>("chatSessions")
      .createIndex({ userId: 1, updatedAt: -1 });
  }

  async createSession(userId: string): Promise<ConciergeSession> {
    const actor = new ObjectId(userId);
    const now = new Date();
    const document: ConciergeDocument = {
      _id: new ObjectId(),
      userId: actor,
      threadId: randomUUID(),
      title: "New conversation",
      messages: [],
      pendingProposal: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.collection<ConciergeDocument>("chatSessions").insertOne(document);
    return toSession(document);
  }

  async listSessions(userId: string): Promise<ConciergeSession[]> {
    const sessions = await this.database
      .collection<ConciergeDocument>("chatSessions")
      .find({ userId: new ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .limit(30)
      .toArray();
    return sessions.map(toSession);
  }

  async getSession(userId: string, threadId: string): Promise<ConciergeSession | null> {
    const session = await this.database.collection<ConciergeDocument>("chatSessions").findOne({
      userId: new ObjectId(userId),
      threadId,
    });
    return session ? toSession(session) : null;
  }

  async appendTurn(
    userId: string,
    threadId: string,
    userMessage: ConciergeMessage,
    reply: ConciergeReply,
    proposal: StoredProposal | null,
  ): Promise<ConciergeSession | null> {
    const userIdObject = new ObjectId(userId);
    const collection = this.database.collection<ConciergeDocument>("chatSessions");
    const current = await collection.findOne({ userId: userIdObject, threadId });
    if (!current) return null;
    const assistantMessage: ConciergeMessage = {
      id: randomUUID(),
      role: "assistant",
      content: reply.assistantMessage,
      createdAt: new Date(),
    };
    const title = current.messages.length === 0 ? userMessage.content.slice(0, 80) : current.title;
    const updated = await collection.findOneAndUpdate(
      { userId: userIdObject, threadId },
      {
        $push: { messages: { $each: [userMessage, assistantMessage], $slice: -100 } },
        $set: { title, pendingProposal: proposal, updatedAt: new Date() },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );
    return updated ? toSession(updated) : null;
  }

  async claimProposal(
    userId: string,
    threadId: string,
    proposalId: string,
  ): Promise<ConciergeSession | null> {
    const updated = await this.database
      .collection<ConciergeDocument>("chatSessions")
      .findOneAndUpdate(
        {
          userId: new ObjectId(userId),
          threadId,
          "pendingProposal.id": proposalId,
          "pendingProposal.status": "pending",
        },
        {
          $set: { "pendingProposal.status": "applying", "pendingProposal.updatedAt": new Date() },
        },
        { returnDocument: "after", includeResultMetadata: false },
      );
    return updated ? toSession(updated) : null;
  }

  async appendAssistantMessage(
    userId: string,
    threadId: string,
    content: string,
  ): Promise<ConciergeSession | null> {
    const updated = await this.database
      .collection<ConciergeDocument>("chatSessions")
      .findOneAndUpdate(
        { userId: new ObjectId(userId), threadId },
        {
          $push: {
            messages: {
              $each: [{ id: randomUUID(), role: "assistant", content, createdAt: new Date() }],
              $slice: -100,
            },
          },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after", includeResultMetadata: false },
      );
    return updated ? toSession(updated) : null;
  }

  async setProposalStatus(
    userId: string,
    threadId: string,
    proposalId: string,
    from: "pending" | "applying",
    to: StoredProposal["status"],
  ): Promise<boolean> {
    const result = await this.database.collection<ConciergeDocument>("chatSessions").updateOne(
      {
        userId: new ObjectId(userId),
        threadId,
        "pendingProposal.id": proposalId,
        "pendingProposal.status": from,
      },
      { $set: { "pendingProposal.status": to, "pendingProposal.updatedAt": new Date() } },
    );
    return result.modifiedCount === 1;
  }
}
