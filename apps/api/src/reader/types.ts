export interface TeaRoomSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  topics: string[];
  frequency: "daily" | "weekly" | "monthly";
  timezone: string;
  coverImage?: string;
  sipCount: number;
}

export interface TeaRoomDetails extends TeaRoomSummary {
  sips: Array<{ title: string; description: string; order: number }>;
  schedule?: { deliveryDay?: string; deliveryTime?: string };
}

export interface TeaRoomPage {
  items: TeaRoomSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface PublishedIssueSummary {
  id: string;
  teaRoomId: string;
  teaRoomName: string;
  teaRoomSlug: string;
  title: string;
  publishedAt: Date;
  sipCount: number;
  excerpt: string;
}

export interface PublishedIssue extends PublishedIssueSummary {
  sips: Array<{
    id: string;
    title: string;
    description: string;
    order: number;
    content?: string;
    items?: unknown[];
    sources?: Array<{ url: string; title?: string; sourceName?: string }>;
  }>;
}

export interface ReaderSubscription {
  status: "active" | "paused";
  createdAt: Date;
  teaRoom: TeaRoomSummary;
}

export interface ReaderStore {
  listPublicTeaRooms(filters: {
    search?: string | undefined;
    category?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | undefined;
    topic?: string | undefined;
    page: number;
    limit: number;
  }): Promise<TeaRoomPage>;
  findPublicTeaRoom(slug: string): Promise<TeaRoomDetails | null>;
  findPublicTeaRoomById(id: string): Promise<TeaRoomSummary | null>;
  listPublishedIssues(
    teaRoomId: string,
    filters: {
      search?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      page: number;
      limit: number;
    },
  ): Promise<{ items: PublishedIssueSummary[]; total: number; page: number; limit: number } | null>;
  getPublishedIssue(id: string): Promise<PublishedIssue | null>;
  listSubscriptions(userId: string): Promise<ReaderSubscription[]>;
  subscribe(userId: string, teaRoomId: string): Promise<{ created: boolean }>;
  setSubscriptionStatus(
    userId: string,
    teaRoomId: string,
    status: "active" | "paused" | "unsubscribed",
  ): Promise<boolean>;
  listRecentIssues(teaRoomIds: string[], limit: number): Promise<PublishedIssueSummary[]>;
  listUpcomingIssues(teaRoomIds: string[], limit: number): Promise<PublishedIssueSummary[]>;
}
