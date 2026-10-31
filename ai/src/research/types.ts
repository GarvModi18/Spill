import type { ResearchReceipt, ResearchSource, ResearchSourceType } from "@spill/shared";

export interface ResearchQuery {
  query: string;
  timeRangeDays: number;
  maxResults: number;
}

export interface RawResearchItem {
  url: string;
  title: string;
  sourceName: string;
  publishedAt?: string;
  snippet?: string;
}

export interface ResearchProvider {
  readonly type: ResearchSourceType;
  search(source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]>;
}

export interface ResearchFailure {
  sourceType: ResearchSourceType;
  sourceUrl?: string;
  code: "not_configured" | "provider_error";
  message: string;
}

export interface ResearchSearchResult {
  receipts: ResearchReceipt[];
  failures: ResearchFailure[];
  retrievedAt: string;
}

export class ResearchProviderError extends Error {
  constructor(
    message: string,
    readonly code: ResearchFailure["code"] = "provider_error",
  ) {
    super(message);
    this.name = "ResearchProviderError";
  }
}
