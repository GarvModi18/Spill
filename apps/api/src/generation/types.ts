import type { GenerationResult, GenerationRoom } from "@spill/ai";

export interface GenerationStore {
  createIndexes(): Promise<void>;
  start(teaRoom: GenerationRoom, requestedBy: string): Promise<string>;
  complete(issueId: string, result: GenerationResult): Promise<void>;
  fail(issueId: string, error: string): Promise<void>;
}
