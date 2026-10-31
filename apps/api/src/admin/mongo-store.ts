import { ObjectId, type Db } from "mongodb";
import {
  adminTeaRoomSchema,
  sipConfigSchema,
  type AdminTeaRoom,
  type SipConfig,
} from "@spill/shared";
import type {
  AdminDashboard,
  AdminStore,
  ManagedSip,
  ManagedTeaRoom,
  TeaRoomStatus,
} from "./types.js";
import { AdminStoreError } from "./types.js";

interface TeaRoomDocument extends AdminTeaRoom {
  _id: ObjectId;
  status: TeaRoomStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}

interface SipDocument extends SipConfig {
  _id: ObjectId;
  teaRoomId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}

function objectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function configFromRoom(room: TeaRoomDocument): AdminTeaRoom {
  const {
    _id,
    status: _status,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    ...config
  } = room;
  void [_id, _status, _createdAt, _updatedAt, _createdBy, _updatedBy];
  return config;
}

function managedSip(sip: SipDocument): ManagedSip {
  const {
    _id,
    teaRoomId,
    createdAt,
    updatedAt,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    ...config
  } = sip;
  void [_createdBy, _updatedBy];
  return {
    ...config,
    id: _id.toHexString(),
    teaRoomId: teaRoomId.toHexString(),
    createdAt,
    updatedAt,
  };
}

export class MongoAdminStore implements AdminStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database
        .collection<TeaRoomDocument>("teaRooms")
        .createIndex({ slug: 1 }, { unique: true }),
      this.database.collection<SipDocument>("sipConfigs").createIndex({ teaRoomId: 1, order: 1 }),
    ]);
  }

  async getDashboard(): Promise<AdminDashboard> {
    const issues = this.database.collection<{ status: string }>("newsletterIssues");
    const [
      teaRooms,
      activeTeaRooms,
      teaLovers,
      activeSubscriptions,
      generatedIssues,
      scheduledIssues,
      awaitingApproval,
      generationFailures,
    ] = await Promise.all([
      this.database.collection<TeaRoomDocument>("teaRooms").countDocuments(),
      this.database.collection<TeaRoomDocument>("teaRooms").countDocuments({ status: "active" }),
      this.database.collection("users").countDocuments({ role: "reader" }),
      this.database.collection("subscriptions").countDocuments({ status: "active" }),
      issues.countDocuments({
        status: { $in: ["review", "editing", "approved", "scheduled", "published"] },
      }),
      issues.countDocuments({ status: "scheduled" }),
      issues.countDocuments({ status: { $in: ["review", "editing"] } }),
      issues.countDocuments({ status: "generation_failed" }),
    ]);
    return {
      teaRooms,
      activeTeaRooms,
      teaLovers,
      activeSubscriptions,
      generatedIssues,
      scheduledIssues,
      awaitingApproval,
      generationFailures,
    };
  }

  async listTeaRooms(): Promise<ManagedTeaRoom[]> {
    const rooms = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .find()
      .sort({ updatedAt: -1 })
      .toArray();
    return Promise.all(rooms.map((room) => this.toManagedRoom(room)));
  }

  async getTeaRoom(id: string): Promise<ManagedTeaRoom | null> {
    const roomId = objectId(id);
    if (!roomId) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: roomId });
    return room ? this.toManagedRoom(room) : null;
  }

  async createTeaRoom(input: AdminTeaRoom, actorId: string): Promise<ManagedTeaRoom> {
    const actor = objectId(actorId);
    if (!actor) throw new AdminStoreError("Invalid administrator account", 401);
    const now = new Date();
    const room: TeaRoomDocument = {
      ...input,
      _id: new ObjectId(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    await this.database.collection<TeaRoomDocument>("teaRooms").insertOne(room);
    await this.audit(actor, "tea_room.created", "teaRoom", room._id, { slug: room.slug });
    return this.toManagedRoom(room);
  }

  async updateTeaRoom(
    id: string,
    input: Partial<AdminTeaRoom>,
    actorId: string,
  ): Promise<ManagedTeaRoom | null> {
    const roomId = objectId(id);
    const actor = objectId(actorId);
    if (!roomId || !actor) return null;
    const collection = this.database.collection<TeaRoomDocument>("teaRooms");
    const current = await collection.findOne({ _id: roomId });
    if (!current) return null;
    if (current.status === "archived")
      throw new AdminStoreError("Archived Tea Rooms cannot be edited", 409);
    const parsed = adminTeaRoomSchema.safeParse({ ...configFromRoom(current), ...input });
    if (!parsed.success)
      throw new AdminStoreError(
        parsed.error.issues[0]?.message ?? "Invalid Tea Room configuration",
        400,
      );
    const updated = await collection.findOneAndUpdate(
      { _id: roomId },
      { $set: { ...parsed.data, updatedAt: new Date(), updatedBy: actor } },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated) return null;
    await this.audit(actor, "tea_room.updated", "teaRoom", roomId, { fields: Object.keys(input) });
    return this.toManagedRoom(updated);
  }

  async transitionTeaRoom(
    id: string,
    action: "activate" | "pause" | "archive",
    actorId: string,
  ): Promise<ManagedTeaRoom | null> {
    const roomId = objectId(id);
    const actor = objectId(actorId);
    if (!roomId || !actor) return null;
    const collection = this.database.collection<TeaRoomDocument>("teaRooms");
    const room = await collection.findOne({ _id: roomId });
    if (!room) return null;
    const transitions: Record<TeaRoomStatus, TeaRoomStatus[]> = {
      draft: ["active", "archived"],
      active: ["paused", "archived"],
      paused: ["active", "archived"],
      archived: [],
    };
    const nextStatus: TeaRoomStatus =
      action === "activate" ? "active" : action === "pause" ? "paused" : "archived";
    if (!transitions[room.status].includes(nextStatus)) {
      throw new AdminStoreError(`Cannot ${action} a Tea Room in ${room.status} status`, 409);
    }
    if (action === "activate") {
      const sipCount = await this.database
        .collection<SipDocument>("sipConfigs")
        .countDocuments({ teaRoomId: roomId });
      if (sipCount === 0)
        throw new AdminStoreError("Add at least one Sip before activating this Tea Room", 409);
      const valid = adminTeaRoomSchema.safeParse(configFromRoom(room));
      if (!valid.success)
        throw new AdminStoreError("Fix the Tea Room schedule before activating it", 400);
    }
    const updated = await collection.findOneAndUpdate(
      { _id: roomId },
      { $set: { status: nextStatus, updatedAt: new Date(), updatedBy: actor } },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated) return null;
    await this.audit(actor, `tea_room.${action}d`, "teaRoom", roomId, {
      from: room.status,
      to: nextStatus,
    });
    return this.toManagedRoom(updated);
  }

  async createSip(
    teaRoomId: string,
    input: Omit<SipConfig, "order">,
    actorId: string,
  ): Promise<ManagedSip | null> {
    const roomId = objectId(teaRoomId);
    const actor = objectId(actorId);
    if (!roomId || !actor) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: roomId });
    if (!room || room.status === "archived") return null;
    const previous = await this.database
      .collection<SipDocument>("sipConfigs")
      .find({ teaRoomId: roomId })
      .sort({ order: -1 })
      .limit(1)
      .next();
    const now = new Date();
    const sip: SipDocument = {
      ...sipConfigSchema.parse({ ...input, order: (previous?.order ?? -1) + 1 }),
      _id: new ObjectId(),
      teaRoomId: roomId,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    await this.database.collection<SipDocument>("sipConfigs").insertOne(sip);
    await this.audit(actor, "sip.created", "sipConfig", sip._id, { teaRoomId, title: sip.title });
    return managedSip(sip);
  }

  async updateSip(
    id: string,
    input: Partial<Omit<SipConfig, "order">>,
    actorId: string,
  ): Promise<ManagedSip | null> {
    const sipId = objectId(id);
    const actor = objectId(actorId);
    if (!sipId || !actor) return null;
    const collection = this.database.collection<SipDocument>("sipConfigs");
    const current = await collection.findOne({ _id: sipId });
    if (!current) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: current.teaRoomId });
    if (!room || room.status === "archived")
      throw new AdminStoreError("This Sip cannot be changed", 409);
    const {
      _id: _sipId,
      teaRoomId: _teaRoomId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      ...currentConfig
    } = current;
    void [_sipId, _teaRoomId, _createdAt, _updatedAt, _createdBy, _updatedBy];
    const parsed = sipConfigSchema.safeParse({ ...currentConfig, ...input, order: current.order });
    if (!parsed.success)
      throw new AdminStoreError(
        parsed.error.issues[0]?.message ?? "Invalid Sip configuration",
        400,
      );
    const updated = await collection.findOneAndUpdate(
      { _id: sipId },
      { $set: { ...parsed.data, updatedAt: new Date(), updatedBy: actor } },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated) return null;
    await this.audit(actor, "sip.updated", "sipConfig", sipId, { fields: Object.keys(input) });
    return managedSip(updated);
  }

  async deleteSip(id: string, actorId: string): Promise<boolean> {
    const sipId = objectId(id);
    const actor = objectId(actorId);
    if (!sipId || !actor) return false;
    const collection = this.database.collection<SipDocument>("sipConfigs");
    const current = await collection.findOne({ _id: sipId });
    if (!current) return false;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: current.teaRoomId });
    if (!room || room.status === "archived")
      throw new AdminStoreError("This Sip cannot be removed", 409);
    await collection.deleteOne({ _id: sipId });
    const remaining = await collection
      .find({ teaRoomId: current.teaRoomId })
      .sort({ order: 1 })
      .toArray();
    await this.writeSipOrder(remaining, actor);
    await this.audit(actor, "sip.deleted", "sipConfig", sipId, {
      teaRoomId: current.teaRoomId.toHexString(),
    });
    return true;
  }

  async duplicateSip(id: string, actorId: string): Promise<ManagedSip | null> {
    const sipId = objectId(id);
    const actor = objectId(actorId);
    if (!sipId || !actor) return null;
    const collection = this.database.collection<SipDocument>("sipConfigs");
    const current = await collection.findOne({ _id: sipId });
    if (!current) return null;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: current.teaRoomId });
    if (!room || room.status === "archived")
      throw new AdminStoreError("This Sip cannot be duplicated", 409);
    await collection.updateMany(
      { teaRoomId: current.teaRoomId, order: { $gt: current.order } },
      { $inc: { order: 1 }, $set: { updatedAt: new Date(), updatedBy: actor } },
    );
    const now = new Date();
    const copy: SipDocument = {
      ...current,
      _id: new ObjectId(),
      title: `${current.title.slice(0, 113)} (copy)`,
      order: current.order + 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    await collection.insertOne(copy);
    await this.audit(actor, "sip.duplicated", "sipConfig", copy._id, {
      sourceSipId: sipId.toHexString(),
    });
    return managedSip(copy);
  }

  async reorderSips(teaRoomId: string, sipIds: string[], actorId: string): Promise<boolean> {
    const roomId = objectId(teaRoomId);
    const actor = objectId(actorId);
    if (!roomId || !actor) return false;
    const room = await this.database
      .collection<TeaRoomDocument>("teaRooms")
      .findOne({ _id: roomId });
    if (!room || room.status === "archived") return false;
    const sips = await this.database
      .collection<SipDocument>("sipConfigs")
      .find({ teaRoomId: roomId })
      .toArray();
    if (sips.length !== sipIds.length || new Set(sipIds).size !== sipIds.length) return false;
    const existingIds = new Set(sips.map((sip) => sip._id.toHexString()));
    if (sipIds.some((id) => !existingIds.has(id))) return false;
    const ordered = sipIds.map((id) => sips.find((sip) => sip._id.toHexString() === id)!);
    await this.writeSipOrder(ordered, actor);
    await this.audit(actor, "sip.reordered", "teaRoom", roomId, { sipIds });
    return true;
  }

  private async toManagedRoom(room: TeaRoomDocument): Promise<ManagedTeaRoom> {
    const sips = await this.database
      .collection<SipDocument>("sipConfigs")
      .find({ teaRoomId: room._id })
      .sort({ order: 1 })
      .toArray();
    return {
      ...configFromRoom(room),
      id: room._id.toHexString(),
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      sips: sips.map(managedSip),
    };
  }

  private async writeSipOrder(sips: SipDocument[], actor: ObjectId): Promise<void> {
    if (!sips.length) return;
    const now = new Date();
    await this.database.collection<SipDocument>("sipConfigs").bulkWrite(
      sips.map((sip, order) => ({
        updateOne: {
          filter: { _id: sip._id },
          update: { $set: { order, updatedAt: now, updatedBy: actor } },
        },
      })),
    );
  }

  private async audit(
    actor: ObjectId,
    action: string,
    entityType: string,
    entityId: ObjectId,
    details: object,
  ) {
    await this.database.collection("auditLogs").insertOne({
      actorId: actor,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date(),
    });
  }
}
