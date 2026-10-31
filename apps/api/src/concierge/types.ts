import type { ConciergeProposal, ConciergeReply } from "@spill/shared";

export interface ConciergeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface StoredProposal {
  id: string;
  proposal: ConciergeProposal;
  preview: string;
  status: "pending" | "applying" | "confirmed" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export interface ConciergeSession {
  threadId: string;
  title: string;
  messages: ConciergeMessage[];
  pendingProposal: StoredProposal | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConciergeStore {
  createIndexes(): Promise<void>;
  createSession(userId: string): Promise<ConciergeSession>;
  listSessions(userId: string): Promise<ConciergeSession[]>;
  getSession(userId: string, threadId: string): Promise<ConciergeSession | null>;
  appendTurn(
    userId: string,
    threadId: string,
    userMessage: ConciergeMessage,
    reply: ConciergeReply,
    proposal: StoredProposal | null,
  ): Promise<ConciergeSession | null>;
  appendAssistantMessage(
    userId: string,
    threadId: string,
    content: string,
  ): Promise<ConciergeSession | null>;
  claimProposal(
    userId: string,
    threadId: string,
    proposalId: string,
  ): Promise<ConciergeSession | null>;
  setProposalStatus(
    userId: string,
    threadId: string,
    proposalId: string,
    from: "pending" | "applying",
    to: StoredProposal["status"],
  ): Promise<boolean>;
}
