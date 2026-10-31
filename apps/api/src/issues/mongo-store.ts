import { ObjectId, type Db } from "mongodb";
import type { ResearchReceipt } from "@spill/shared";
import type { IssueDetail, IssueSip, IssueStatus, IssueStore, IssueSummary } from "./types.js";

interface IssueDocument {
  _id: ObjectId;
  teaRoomId: ObjectId;
  title: string;
  status: IssueStatus;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  scheduledAt?: Date;
  rejectionReason?: string;
}
interface SipDocument {
  _id: ObjectId;
  issueId: ObjectId;
  sipId: ObjectId;
  title: string;
  description: string;
  order: number;
  status: IssueSip["status"];
  content: string;
  items: unknown[];
  qualityIssues: IssueSip["qualityIssues"];
  version?: number;
}
type ReceiptDocument = Omit<ResearchReceipt, "retrievedAt" | "publishedAt"> & {
  _id: ObjectId;
  issueId: ObjectId;
  sipId: ObjectId;
  retrievedAt: Date;
  publishedAt?: Date | null;
};

function oid(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export class MongoIssueStore implements IssueStore {
  constructor(private readonly database: Db) {}
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database
        .collection("issueSipVersions")
        .createIndex({ issueSipId: 1, version: -1 }, { unique: true }),
      this.database
        .collection("researchSources")
        .createIndex({ issueId: 1, sipId: 1, retrievedAt: -1 }),
    ]);
  }
  async list(filters: { teaRoomId?: string; status?: string } = {}): Promise<IssueSummary[]> {
    const query: Record<string, unknown> = {};
    if (filters.teaRoomId) {
      const id = oid(filters.teaRoomId);
      if (!id) return [];
      query.teaRoomId = id;
    }
    if (filters.status) query.status = filters.status;
    const issues = await this.database
      .collection<IssueDocument>("newsletterIssues")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const rooms = new Map(
      (
        await this.database
          .collection<{ _id: ObjectId; name: string }>("teaRooms")
          .find({ _id: { $in: issues.map(({ teaRoomId }) => teaRoomId) } })
          .toArray()
      ).map((room) => [room._id.toHexString(), room.name]),
    );
    return Promise.all(
      issues.map(async (issue) => {
        const sections = await this.database
          .collection<SipDocument>("issueSips")
          .find({ issueId: issue._id })
          .toArray();
        return {
          id: issue._id.toHexString(),
          teaRoomId: issue.teaRoomId.toHexString(),
          teaRoomName: rooms.get(issue.teaRoomId.toHexString()) ?? "Tea Room",
          title: issue.title,
          status: issue.status,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
          sipCount: sections.length,
          failedSipCount: sections.filter(({ status }) => status === "failed").length,
          ...(issue.scheduledAt ? { scheduledAt: issue.scheduledAt.toISOString() } : {}),
        };
      }),
    );
  }
  async get(id: string): Promise<IssueDetail | null> {
    const issueId = oid(id);
    if (!issueId) return null;
    const issue = await this.database
      .collection<IssueDocument>("newsletterIssues")
      .findOne({ _id: issueId });
    if (!issue) return null;
    const room = await this.database
      .collection<{ _id: ObjectId; name: string }>("teaRooms")
      .findOne({ _id: issue.teaRoomId });
    const docs = await this.database
      .collection<SipDocument>("issueSips")
      .find({ issueId })
      .sort({ order: 1 })
      .toArray();
    const sips = await Promise.all(
      docs.map(async (sip) => {
        const [receipts, versionDocs] = await Promise.all([
          this.database
            .collection<ReceiptDocument>("researchSources")
            .find({ issueId, sipId: sip.sipId })
            .sort({ retrievedAt: -1 })
            .limit(100)
            .toArray(),
          this.database
            .collection<{
              version: number;
              title: string;
              content: string;
              changedBy?: ObjectId | null;
              reason: string;
              createdAt: Date;
            }>("issueSipVersions")
            .find({ issueSipId: sip._id })
            .sort({ version: -1 })
            .limit(50)
            .toArray(),
        ]);
        return {
          id: sip._id.toHexString(),
          sipId: sip.sipId.toHexString(),
          title: sip.title,
          description: sip.description,
          order: sip.order,
          status: sip.status,
          content: sip.content,
          items: sip.items ?? [],
          qualityIssues: sip.qualityIssues ?? [],
          version: sip.version ?? 1,
          receipts: receipts.map((receipt) => ({
            url: receipt.url,
            title: receipt.title,
            sourceName: receipt.sourceName,
            retrievedAt: receipt.retrievedAt.toISOString(),
            snippet: receipt.snippet,
            sourceType: receipt.sourceType,
            verificationStatus: receipt.verificationStatus,
            ...(receipt.publishedAt ? { publishedAt: receipt.publishedAt.toISOString() } : {}),
          })),
          versions: versionDocs.map((version) => ({
            version: version.version,
            title: version.title,
            content: version.content,
            changedBy: version.changedBy?.toHexString() ?? null,
            reason: version.reason,
            createdAt: version.createdAt.toISOString(),
          })),
        } satisfies IssueSip;
      }),
    );
    return {
      id: issue._id.toHexString(),
      teaRoomId: issue.teaRoomId.toHexString(),
      teaRoomName: room?.name ?? "Tea Room",
      title: issue.title,
      status: issue.status,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      sipCount: sips.length,
      failedSipCount: sips.filter(({ status }) => status === "failed").length,
      sips,
      ...(issue.approvedAt ? { approvedAt: issue.approvedAt.toISOString() } : {}),
      ...(issue.rejectedAt ? { rejectedAt: issue.rejectedAt.toISOString() } : {}),
      ...(issue.scheduledAt ? { scheduledAt: issue.scheduledAt.toISOString() } : {}),
      ...(issue.rejectionReason ? { rejectionReason: issue.rejectionReason } : {}),
    };
  }
  async updateSip(
    issueIdValue: string,
    issueSipIdValue: string,
    actorValue: string,
    input: { title?: string | undefined; content: string; expectedVersion: number },
  ): Promise<IssueDetail | null> {
    const issueId = oid(issueIdValue);
    const sipId = oid(issueSipIdValue);
    const actor = oid(actorValue);
    if (!issueId || !sipId || !actor) return null;
    const issue = await this.database
      .collection<IssueDocument>("newsletterIssues")
      .findOne({ _id: issueId });
    if (!issue || !["review", "partial", "review_missed"].includes(issue.status)) return null;
    const sips = this.database.collection<SipDocument>("issueSips");
    const sip = await sips.findOne({ _id: sipId, issueId });
    if (!sip || (sip.version ?? 1) !== input.expectedVersion || sip.status === "failed")
      return null;
    const nextVersion = (sip.version ?? 1) + 1;
    const now = new Date();
    await this.database.collection("issueSipVersions").insertOne({
      _id: new ObjectId(),
      issueId,
      issueSipId: sipId,
      version: nextVersion,
      title: input.title ?? sip.title,
      content: input.content,
      changedBy: actor,
      reason: "manual_edit",
      createdAt: now,
    });
    const changed = await sips.updateOne(
      { _id: sipId, issueId, version: sip.version ?? 1 },
      {
        $set: {
          title: input.title ?? sip.title,
          content: input.content,
          version: nextVersion,
          status: "needs_review",
          updatedAt: now,
        },
      },
    );
    if (changed.modifiedCount !== 1) return null;
    await this.audit(actor, "issue_sip.edited", issueId, {
      issueSipId: sipId,
      version: nextVersion,
    });
    return this.get(issueIdValue);
  }
  async approve(issueIdValue: string, actorValue: string): Promise<IssueDetail | null> {
    const issueId = oid(issueIdValue);
    const actor = oid(actorValue);
    if (!issueId || !actor) return null;
    const sips = await this.database
      .collection<SipDocument>("issueSips")
      .find({ issueId })
      .toArray();
    if (!sips.length || sips.some(({ status, content }) => status === "failed" || !content.trim()))
      return null;
    const now = new Date();
    const result = await this.database.collection<IssueDocument>("newsletterIssues").updateOne(
      { _id: issueId, status: { $in: ["review", "partial", "review_missed"] } },
      {
        $set: { status: "approved", approvedAt: now, approvedBy: actor, updatedAt: now },
        $unset: { rejectionReason: "" },
      },
    );
    if (!result.modifiedCount) return null;
    await this.audit(actor, "issue.approved", issueId, { sipCount: sips.length });
    return this.get(issueIdValue);
  }
  async reject(
    issueIdValue: string,
    actorValue: string,
    reason: string,
  ): Promise<IssueDetail | null> {
    const issueId = oid(issueIdValue);
    const actor = oid(actorValue);
    if (!issueId || !actor) return null;
    const now = new Date();
    const result = await this.database.collection<IssueDocument>("newsletterIssues").updateOne(
      { _id: issueId, status: { $in: ["review", "partial", "review_missed"] } },
      {
        $set: {
          status: "rejected",
          rejectedAt: now,
          rejectedBy: actor,
          rejectionReason: reason,
          updatedAt: now,
        },
      },
    );
    if (!result.modifiedCount) return null;
    await this.audit(actor, "issue.rejected", issueId, { reason });
    return this.get(issueIdValue);
  }
  async schedule(
    issueIdValue: string,
    actorValue: string,
    scheduledAt: Date,
  ): Promise<IssueDetail | null> {
    const issueId = oid(issueIdValue);
    const actor = oid(actorValue);
    if (!issueId || !actor) return null;
    const changed = await this.database
      .collection<IssueDocument & { approvedAt?: Date }>("newsletterIssues")
      .updateOne(
        { _id: issueId, status: { $in: ["approved", "scheduled"] }, approvedAt: { $type: "date" } },
        { $set: { status: "scheduled", scheduledAt, updatedAt: new Date(), scheduledBy: actor } },
      );
    if (!changed.modifiedCount) return null;
    await this.audit(actor, "issue.scheduled", issueId, { scheduledAt });
    return this.get(issueIdValue);
  }
  async cancel(issueIdValue: string, actorValue: string): Promise<IssueDetail | null> {
    const issueId = oid(issueIdValue);
    const actor = oid(actorValue);
    if (!issueId || !actor) return null;
    const changed = await this.database.collection("newsletterIssues").updateOne(
      { _id: issueId, status: "scheduled" },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: actor,
          updatedAt: new Date(),
        },
      },
    );
    if (!changed.modifiedCount) return null;
    await this.audit(actor, "issue.cancelled", issueId, {});
    return this.get(issueIdValue);
  }
  private async audit(actor: ObjectId, action: string, issueId: ObjectId, details: object) {
    await this.database.collection("auditLogs").insertOne({
      actorId: actor,
      action,
      entityType: "newsletterIssue",
      entityId: issueId,
      details,
      createdAt: new Date(),
    });
  }
}
