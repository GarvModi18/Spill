import type { ConciergeReply } from "@spill/shared";

export interface ConciergeTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConciergeRoomContext {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string;
  frequency: string;
  timezone: string;
  schedule: unknown;
  sips: Array<{ id: string; title: string; description: string; type: string }>;
}

export interface ConciergeInput {
  message: string;
  history: ConciergeTurn[];
  teaRooms: ConciergeRoomContext[];
}

export interface ConciergeModel {
  respond(input: ConciergeInput): Promise<ConciergeReply>;
}
