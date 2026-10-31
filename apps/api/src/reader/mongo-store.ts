import { ObjectId, type Db } from "mongodb";
import type {
  PublishedIssue,
  PublishedIssueSummary,
  ReaderStore,
  ReaderSubscription,
  TeaRoomDetails,
  TeaRoomPage,
  TeaRoomSummary,
} from "./types.js";

interface TeaRoomDocument {
  _id: ObjectId;
  name: string;
  slug: string;
  description: string;
  category: string;
  topics?: string[];
  frequency: "daily" | "weekly" | "monthly";
  timezone: string;
  isPublic: boolean;
  status: string;
  coverImage?: string;
  schedule?: {
    delivery: { time: string; weekday?: string; dayOfMonth?: number };
  };
  sipCount?: number;
}

interface IssueDocument {
  _id: ObjectId;
  teaRoomId: ObjectId;
  status: string;
  title?: string;
  publishedAt?: Date;
  scheduledAt?: Date;
  excerpt?: string;
}

interface IssueSipDocument {
  _id: ObjectId;
  issueId: ObjectId;
  title: string;
  description?: string;
  order?: number;
  content?: string;
  items?: unknown[];
  sources?: Array<{ url: string; title?: string; sourceName?: string }>;
  status?: string;
}

interface SubscriptionDocument {
  _id: ObjectId;
  userId: ObjectId;
  teaRoomId: ObjectId;
  status: "active" | "paused" | "unsubscribed";
  createdAt: Date;
  updatedAt: Date;
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function roomSummary(room: TeaRoomDocument): TeaRoomSummary {
  return {
    id: room._id.toHexString(),
    name: room.name,
    slug: room.slug,
    description: room.description,
    category: room.category,
    topics: room.topics ?? [],
    frequency: room.frequency,
    timezone: room.timezone,
    ...(room.coverImage ? { coverImage: room.coverImage } : {}),
    sipCount: room.sipCount ?? 0,
  };
}

const publicRoomQuery = { isPublic: true, status: "active" };

function safeRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export class MongoReaderStore implements ReaderStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database
        .collection<SubscriptionDocument>("subscriptions")
        .createIndex({ userId: 1, teaRoomId: 1 }, { unique: true }),
      this.database
        .collection<SubscriptionDocument>("subscriptions")
        .createIndex({ userId: 1, status: 1 }),
      this.database
        .collection<IssueDocument>("newsletterIssues")
        .createIndex({ teaRoomId: 1, status: 1, publishedAt: -1 }),
      this.database
        .collection<TeaRoomDocument>("teaRooms")
        .createIndex({ isPublic: 1, status: 1, category: 1, frequency: 1 }),
    ]);
  }

  async listPublicTeaRooms(filters: {
    search?: string;
    category?: string;
    frequency?: "daily" | "weekly" | "monthly";
    topic?: string;
    page: number;
    limit: number;
  }): Promise<TeaRoomPage> {
    const query: Record<string, unknown> = { ...publicRoomQuery };
    if (filters.search) {
      const expression = safeRegex(filters.search);
      query.$or = [
        { name: expression },
        { description: expression },
        { category: expression },
        { topics: expression },
      ];
    }
    if (filters.category) query.category = safeRegex(filters.category);
    if (filters.frequency) query.frequency = filters.frequency;
    if (filters.topic) query.topics = safeRegex(filters.topic);
    const rooms = this.database.collection<TeaRoomDocument>("teaRooms");
    const [total, records] = await Promise.all([
      rooms.countDocuments(query),
      rooms
        .find(query)
        .sort({ name: 1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit)
        .toArray(),
    ]);
    const sipConfigs = this.database.collection("sipConfigs");
    const items = await Promise.all(
      records.map(async (room) => {
        const sipCount = await sipConfigs.countDocuments({ teaRoomId: room._id });
        return roomSummary({ ...room, sipCount });
      }),
    );
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async findPublicTeaRoom(slug: string): Promise<TeaRoomDetails | null> {
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ ...publicRoomQuery, slug });
    if (!room) return null;
    const sips = await this.database
      .collection<{ title: string; description: string; order: number }>("sipConfigs")
      .find({ teaRoomId: room._id })
      .project({ title: 1, description: 1, order: 1 })
      .sort({ order: 1 })
      .toArray();
    return {
      ...roomSummary({ ...room, sipCount: sips.length }),
      sips: sips.map((sip) => ({
        title: sip.title,
        description: sip.description,
        order: sip.order,
      })),
      ...(room.schedule ? { schedule: room.schedule } : {}),
    };
  }

  async findPublicTeaRoomById(id: string): Promise<TeaRoomSummary | null> {
    const roomId = toObjectId(id);
    if (!roomId) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: roomId, ...publicRoomQuery });
    return room ? roomSummary(room) : null;
  }

  async listPublishedIssues(
    teaRoomId: string,
    filters: {
      search?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      page: number;
      limit: number;
    },
  ): Promise<{
    items: PublishedIssueSummary[];
    total: number;
    page: number;
    limit: number;
  } | null> {
    const roomObjectId = toObjectId(teaRoomId);
    if (!roomObjectId) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: roomObjectId, ...publicRoomQuery });
    if (!room) return null;
    const query: Record<string, unknown> = { teaRoomId: roomObjectId, status: "published" };
    if (filters.search) query.title = safeRegex(filters.search);
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.$gte = new Date(`${filters.from}T00:00:00.000Z`);
      if (filters.to) range.$lte = new Date(`${filters.to}T23:59:59.999Z`);
      query.publishedAt = range;
    }
    const issues = this.database.collection<IssueDocument>("newsletterIssues");
    const [total, records] = await Promise.all([
      issues.countDocuments(query),
      issues
        .find(query)
        .sort({ publishedAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit)
        .toArray(),
    ]);
    const items = await Promise.all(records.map((issue) => this.issueSummary(issue, room)));
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getPublishedIssue(id: string): Promise<PublishedIssue | null> {
    const issueId = toObjectId(id);
    if (!issueId) return null;
    const issue = await this.database
      .collection<IssueDocument>("newsletterIssues")
      .findOne({ _id: issueId, status: "published" });
    if (!issue) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: issue.teaRoomId, ...publicRoomQuery });
    if (!room) return null;
    const sips = await this.database
      .collection<IssueSipDocument>("issueSips")
      .find({ issueId: issue._id, status: { $ne: "failed" } })
      .sort({ order: 1 })
      .toArray();
    const summary = await this.issueSummary(issue, room);
    return {
      ...summary,
      sips: sips.map((sip) => ({
        id: sip._id.toHexString(),
        title: sip.title,
        description: sip.description ?? "",
        order: sip.order ?? 0,
        ...(sip.content ? { content: sip.content } : {}),
        ...(sip.items ? { items: sip.items } : {}),
        ...(sip.sources ? { sources: sip.sources } : {}),
      })),
    };
  }

  async listSubscriptions(userId: string): Promise<ReaderSubscription[]> {
    const readerId = toObjectId(userId);
    if (!readerId) return [];
    const subscriptions = await this.database
      .collection<SubscriptionDocument>("subscriptions")
      .find({ userId: readerId, status: { $in: ["active", "paused"] } })
      .sort({ createdAt: -1 })
      .toArray();
    const rooms = this.database.collection<TeaRoomDocument>("teaRooms");
    const results: ReaderSubscription[] = [];
    for (const subscription of subscriptions) {
      const room = await rooms.findOne({ _id: subscription.teaRoomId, ...publicRoomQuery });
      if (room && subscription.status !== "unsubscribed")
        results.push({
          status: subscription.status,
          createdAt: subscription.createdAt,
          teaRoom: roomSummary(room),
        });
    }
    return results;
  }

  async subscribe(userId: string, teaRoomId: string): Promise<{ created: boolean }> {
    const readerId = toObjectId(userId);
    const roomId = toObjectId(teaRoomId);
    if (!readerId || !roomId) return { created: false };
    const now = new Date();
    const result = await this.database
      .collection<SubscriptionDocument>("subscriptions")
      .updateOne(
        { userId: readerId, teaRoomId: roomId },
        { $set: { status: "active", updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return { created: result.upsertedCount > 0 };
  }

  async setSubscriptionStatus(
    userId: string,
    teaRoomId: string,
    status: "active" | "paused" | "unsubscribed",
  ): Promise<boolean> {
    const readerId = toObjectId(userId);
    const roomId = toObjectId(teaRoomId);
    if (!readerId || !roomId) return false;
    const result = await this.database
      .collection<SubscriptionDocument>("subscriptions")
      .updateOne(
        { userId: readerId, teaRoomId: roomId, status: { $ne: "unsubscribed" } },
        { $set: { status, updatedAt: new Date() } },
      );
    return result.matchedCount > 0;
  }

  async listRecentIssues(teaRoomIds: string[], limit: number): Promise<PublishedIssueSummary[]> {
    return this.listIssueSummaries(teaRoomIds, "published", limit);
  }

  async listUpcomingIssues(teaRoomIds: string[], limit: number): Promise<PublishedIssueSummary[]> {
    return this.listIssueSummaries(teaRoomIds, "scheduled", limit, {
      scheduledAt: { $gt: new Date() },
    });
  }

  private async listIssueSummaries(
    teaRoomIds: string[],
    status: "published" | "scheduled",
    limit: number,
    extraQuery: Record<string, unknown> = {},
  ): Promise<PublishedIssueSummary[]> {
    const ids = teaRoomIds.map(toObjectId).filter((id): id is ObjectId => id !== null);
    if (!ids.length) return [];
    const records = await this.database
      .collection<IssueDocument>("newsletterIssues")
      .find({ teaRoomId: { $in: ids }, status, ...extraQuery })
      .sort({ publishedAt: -1, scheduledAt: 1 })
      .limit(limit)
      .toArray();
    const rooms = this.database.collection<TeaRoomDocument>("teaRooms");
    const summaries: PublishedIssueSummary[] = [];
    for (const issue of records) {
      const room = await rooms.findOne({ _id: issue.teaRoomId, ...publicRoomQuery });
      if (room) summaries.push(await this.issueSummary(issue, room));
    }
    return summaries;
  }

  private async issueSummary(
    issue: IssueDocument,
    room: TeaRoomDocument,
  ): Promise<PublishedIssueSummary> {
    const sipCount = await this.database
      .collection<IssueSipDocument>("issueSips")
      .countDocuments({ issueId: issue._id });
    return {
      id: issue._id.toHexString(),
      teaRoomId: room._id.toHexString(),
      teaRoomName: room.name,
      teaRoomSlug: room.slug,
      title: issue.title ?? room.name,
      publishedAt: issue.publishedAt ?? issue.scheduledAt ?? new Date(0),
      sipCount,
      excerpt: issue.excerpt ?? "",
    };
  }
}
