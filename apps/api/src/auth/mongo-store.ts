import { ObjectId, type Db } from "mongodb";
import type { EmailPreferences, UserRole } from "@spill/shared";
import type { AuthStore, AuthUser, StoredUser } from "./types.js";

interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailPreferences?: EmailPreferences;
  createdAt: Date;
  emailVerified?: boolean;
}

interface SessionDocument {
  _id: string;
  userId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
}
interface EmailVerificationDocument {
  _id: string;
  userId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

function publicUser(document: UserDocument): AuthUser {
  const preferences = document.emailPreferences;
  return {
    id: document._id.toHexString(),
    name: document.name,
    email: document.email,
    role: document.role,
    emailPreferences: {
      teaUpdates: preferences?.teaUpdates ?? true,
      productUpdates: preferences?.productUpdates ?? false,
    },
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
      this.database
        .collection<EmailVerificationDocument>("emailVerifications")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }

  async createUser(user: Omit<StoredUser, "id">): Promise<AuthUser> {
    const document: UserDocument = { ...user, emailVerified: false, _id: new ObjectId() };
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

  async updateProfile(
    id: string,
    updates: {
      name?: string | undefined;
      emailPreferences?: Partial<EmailPreferences> | undefined;
    },
  ): Promise<AuthUser | null> {
    if (!ObjectId.isValid(id)) return null;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.emailPreferences) {
      for (const [key, value] of Object.entries(updates.emailPreferences)) {
        set[`emailPreferences.${key}`] = value;
      }
    }
    const user = await this.database
      .collection<UserDocument>("users")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: set },
        { returnDocument: "after", includeResultMetadata: false },
      );
    return user ? publicUser(user) : null;
  }

  async createEmailVerification(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.collection<EmailVerificationDocument>("emailVerifications").insertOne({
      _id: tokenHash,
      userId: new ObjectId(userId),
      expiresAt,
      createdAt: new Date(),
    });
  }

  async verifyEmail(tokenHash: string): Promise<boolean> {
    const collection = this.database.collection<EmailVerificationDocument>("emailVerifications");
    const token = await collection.findOneAndDelete(
      { _id: tokenHash, expiresAt: { $gt: new Date() } },
      { includeResultMetadata: false },
    );
    if (!token) return false;
    const updated = await this.database
      .collection<UserDocument>("users")
      .updateOne({ _id: token.userId }, { $set: { emailVerified: true, updatedAt: new Date() } });
    return updated.modifiedCount === 1;
  }
}
