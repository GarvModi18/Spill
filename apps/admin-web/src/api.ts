const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
export const READER_APP_URL = import.meta.env.VITE_READER_URL ?? "http://localhost:5173";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new ApiError(body.error ?? "Something went wrong. Please try again.", response.status);
  return body as T;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin";
}

export interface AdminSip {
  id: string;
  teaRoomId: string;
  title: string;
  description: string;
  type: string;
  itemCount: number;
  instructions: string;
  order: number;
  researchSources: Array<{ type: string; url?: string; enabled: boolean }>;
  timeRangeDays: number;
  outputSchema?: Record<string, unknown>;
  writingStyle: string;
  contentLength: "short" | "medium" | "long";
}

export interface SchedulePoint {
  time: string;
  weekday?: string;
  dayOfMonth?: number;
}

export interface ManagedTeaRoom {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  topics: string[];
  audience: string;
  coverImage: string;
  editorialVoice: string;
  frequency: "daily" | "weekly" | "monthly";
  timezone: string;
  schedule: { generation: SchedulePoint; reviewDeadline: SchedulePoint; delivery: SchedulePoint };
  defaultResearchSettings: {
    sources: Array<{ type: string; url?: string; enabled: boolean }>;
    timeRangeDays: number;
  };
  emailTemplate: string;
  isPublic: boolean;
  status: "draft" | "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
  sips: AdminSip[];
}

export type RoomInput = Omit<ManagedTeaRoom, "id" | "status" | "createdAt" | "updatedAt" | "sips">;

export type SipInput = Omit<AdminSip, "id" | "teaRoomId" | "order">;

export interface AdminDashboard {
  teaRooms: number;
  activeTeaRooms: number;
  teaLovers: number;
  activeSubscriptions: number;
  generatedIssues: number;
  scheduledIssues: number;
  awaitingApproval: number;
  generationFailures: number;
}

export interface ConciergeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConciergeSession {
  threadId: string;
  title: string;
  messages: ConciergeMessage[];
  pendingProposal: {
    id: string;
    preview: string;
    status: "pending" | "applying" | "confirmed" | "rejected";
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueSummary {
  id: string;
  teaRoomId: string;
  teaRoomName: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sipCount: number;
  failedSipCount: number;
  scheduledAt?: string;
}
export interface IssueReceipt {
  url: string;
  title: string;
  sourceName: string;
  publishedAt?: string;
  retrievedAt: string;
  snippet: string;
  sourceType: string;
  verificationStatus: string;
}
export interface IssueSip {
  id: string;
  sipId: string;
  title: string;
  description: string;
  order: number;
  status: string;
  content: string;
  qualityIssues: Array<{ code: string; message: string }>;
  version: number;
  items: unknown[];
  receipts: IssueReceipt[];
  versions: Array<{
    version: number;
    title: string;
    content: string;
    changedBy: string | null;
    reason: string;
    createdAt: string;
  }>;
}
export interface IssueDetail extends IssueSummary {
  sips: IssueSip[];
  approvedAt?: string;
  rejectedAt?: string;
  scheduledAt?: string;
  rejectionReason?: string;
}
