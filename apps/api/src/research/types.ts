import type { ResearchReceipt } from "@spill/shared";
import type { ResearchFailure, ResearchSearchResult } from "@spill/ai";

export interface ResearchRunInput {
  teaRoomId: string;
  sipId: string;
  query: string;
  requestedBy: string;
}

export interface StoredResearchRun extends ResearchRunInput {
  id: string;
  status: "completed" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  receiptCount: number;
  failures: ResearchFailure[];
}

export interface ResearchStore {
  createIndexes(): Promise<void>;
  save(input: ResearchRunInput, result: ResearchSearchResult): Promise<StoredResearchRun>;
}

export type { ResearchReceipt };
