import type { AdminTeaRoom, SipConfig } from "@spill/shared";

export type TeaRoomStatus = "draft" | "active" | "paused" | "archived";

export interface ManagedTeaRoom extends AdminTeaRoom {
  id: string;
  status: TeaRoomStatus;
  createdAt: Date;
  updatedAt: Date;
  sips: ManagedSip[];
}

export interface ManagedSip extends SipConfig {
  id: string;
  teaRoomId: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface AdminStore {
  createIndexes(): Promise<void>;
  getDashboard(): Promise<AdminDashboard>;
  listTeaRooms(): Promise<ManagedTeaRoom[]>;
  getTeaRoom(id: string): Promise<ManagedTeaRoom | null>;
  createTeaRoom(input: AdminTeaRoom, actorId: string): Promise<ManagedTeaRoom>;
  updateTeaRoom(
    id: string,
    input: Partial<AdminTeaRoom>,
    actorId: string,
  ): Promise<ManagedTeaRoom | null>;
  transitionTeaRoom(
    id: string,
    action: "activate" | "pause" | "archive",
    actorId: string,
  ): Promise<ManagedTeaRoom | null>;
  createSip(
    teaRoomId: string,
    input: Omit<SipConfig, "order">,
    actorId: string,
  ): Promise<ManagedSip | null>;
  updateSip(
    id: string,
    input: Partial<Omit<SipConfig, "order">>,
    actorId: string,
  ): Promise<ManagedSip | null>;
  deleteSip(id: string, actorId: string): Promise<boolean>;
  duplicateSip(id: string, actorId: string): Promise<ManagedSip | null>;
  reorderSips(teaRoomId: string, sipIds: string[], actorId: string): Promise<boolean>;
}

export class AdminStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdminStoreError";
  }
}
