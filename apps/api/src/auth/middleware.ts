import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import type { UserRole } from "@spill/shared";
import type { AuthStore } from "./types.js";

export const SESSION_COOKIE = "spill_session";

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = valueParts.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function authenticate(store: AuthStore): RequestHandler {
  return async (request, response, next) => {
    const token = readSessionToken(request.headers.cookie);
    if (!token) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const tokenHash = hashSessionToken(token);
      const session = await store.findSession(tokenHash);
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      const user = await store.findUserById(session.userId);
      if (!user) {
        await store.deleteSession(tokenHash);
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      request.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(request.authUser.role)) {
      response.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
