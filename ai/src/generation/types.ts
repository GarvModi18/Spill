import type { AdminTeaRoom, ResearchReceipt, SipConfig } from "@spill/shared";
import type { ResearchService } from "../research/service.js";

export interface GenerationRoom extends AdminTeaRoom {
  id: string;
}
export interface GenerationSip extends SipConfig {
  id: string;
}
export interface GenerationInput {
  issueId: string;
  teaRoom: GenerationRoom;
  sips: GenerationSip[];
  maxConcurrency?: number;
}
export interface GeneratedItem {
  title: string;
  content: string;
  claims: Array<{ claim: string; supported: boolean; evidenceUrls: string[] }>;
}
export interface GenerationDraft {
  items: GeneratedItem[];
}
export interface GenerationQualityIssue {
  code: "item_count" | "empty_content" | "unsupported_claim" | "unknown_evidence" | "no_evidence";
  message: string;
}
export interface GenerationSipResult {
  sipId: string;
  title: string;
  description: string;
  order: number;
  status: "ready_for_review" | "needs_review" | "failed";
  content: string;
  items: GeneratedItem[];
  receipts: ResearchReceipt[];
  qualityIssues: GenerationQualityIssue[];
  error?: string;
  modelVersion: string;
  promptVersion: string;
  attempts: number;
}
export interface GenerationResult {
  issueId: string;
  status: "review" | "partial" | "generation_failed";
  sips: GenerationSipResult[];
  completedAt: string;
}
export interface GenerationModel {
  readonly modelVersion: string;
  generate(input: {
    teaRoom: GenerationRoom;
    sip: GenerationSip;
    query: string;
    receipts: ResearchReceipt[];
  }): Promise<GenerationDraft>;
}
export interface GenerationDependencies {
  research: Pick<ResearchService, "search">;
  model: GenerationModel;
}
