import type { ResearchReceipt } from "@spill/shared";

export type IssueStatus =
  | "generating"
  | "review"
  | "partial"
  | "generation_failed"
  | "approved"
  | "rejected"
  | "scheduled"
  | "published";
export interface IssueSummary {
  id: string;
  teaRoomId: string;
  teaRoomName: string;
  title: string;
  status: IssueStatus;
  createdAt: string;
  updatedAt: string;
  sipCount: number;
  failedSipCount: number;
}
export interface IssueVersion {
  version: number;
  title: string;
  content: string;
  changedBy: string | null;
  reason: string;
  createdAt: string;
}
export interface IssueSip {
  id: string;
  sipId: string;
  title: string;
  description: string;
  order: number;
  status: "ready_for_review" | "needs_review" | "failed";
  content: string;
  qualityIssues: Array<{ code: string; message: string }>;
  version: number;
  items: unknown[];
  receipts: ResearchReceipt[];
  versions: IssueVersion[];
}
export interface IssueDetail extends IssueSummary {
  sips: IssueSip[];
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}
export interface IssueStore {
  createIndexes(): Promise<void>;
  list(filters?: { teaRoomId?: string; status?: string }): Promise<IssueSummary[]>;
  get(id: string): Promise<IssueDetail | null>;
  updateSip(
    issueId: string,
    issueSipId: string,
    actorId: string,
    input: { title?: string | undefined; content: string; expectedVersion: number },
  ): Promise<IssueDetail | null>;
  approve(issueId: string, actorId: string): Promise<IssueDetail | null>;
  reject(issueId: string, actorId: string, reason: string): Promise<IssueDetail | null>;
}
