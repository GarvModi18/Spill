import { ObjectId, type Db } from "mongodb";
import type { UserRole } from "@spill/shared";
import type { AuthStore, AuthUser, StoredUser } from "./types.js";

interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

interface SessionDocument {
  _id: string;
  userId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

function publicUser(document: UserDocument): AuthUser {
  return {
    id: document._id.toHexString(),
    name: document.name,
    email: document.email,
    role: document.role,
    createdAt: document.createdAt,
  };
}

export class MongoAuthStore implements AuthStore {
  constructor(private readonly database: Db) {}

  async createIndexes(): Promise<void> {
    await Promise.all([
      this.database.collection<UserDocument>("users").createIndex({ email: 1 }, { unique: true }),
      this.database
        .collection<SessionDocument>("sessions")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.database.collection<SessionDocument>("sessions").createIndex({ userId: 1 }),
    ]);
  }

  async createUser(user: Omit<StoredUser, "id">): Promise<AuthUser> {
    const document: UserDocument = { ...user, _id: new ObjectId() };
    await this.database.collection<UserDocument>("users").insertOne(document);
    return publicUser(document);
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const document = await this.database.collection<UserDocument>("users").findOne({ email });
    if (!document) return null;
    return { ...publicUser(document), passwordHash: document.passwordHash };
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    if (!ObjectId.isValid(id)) return null;
    const document = await this.database
      .collection<UserDocument>("users")
      .findOne({ _id: new ObjectId(id) });
    return document ? publicUser(document) : null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.database.collection<SessionDocument>("sessions").insertOne({
      _id: tokenHash,
      userId: new ObjectId(userId),
      expiresAt,
      createdAt: new Date(),
    });
  }

  async findSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null> {
    const session = await this.database
      .collection<SessionDocument>("sessions")
      .findOne({ _id: tokenHash });
    if (!session) return null;
    return { userId: session.userId.toHexString(), expiresAt: session.expiresAt };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.collection<SessionDocument>("sessions").deleteOne({ _id: tokenHash });
  }
}
