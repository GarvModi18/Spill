import type { UserRole } from "@spill/shared";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
}

// Express request augmentation requires declaration merging in this namespace.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}
