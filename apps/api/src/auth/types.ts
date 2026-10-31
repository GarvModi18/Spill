import type { EmailPreferences, UserRole } from "@spill/shared";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailPreferences: EmailPreferences;
  createdAt: Date;
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface AuthStore {
  createUser(user: Omit<StoredUser, "id">): Promise<AuthUser>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  updateProfile(
    id: string,
    updates: {
      name?: string | undefined;
      emailPreferences?: Partial<EmailPreferences> | undefined;
    },
  ): Promise<AuthUser | null>;
  createEmailVerification?(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  verifyEmail?(tokenHash: string): Promise<boolean>;
}

// Express request augmentation requires declaration merging in this namespace.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

declare module "node:http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}
