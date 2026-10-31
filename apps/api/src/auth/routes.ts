import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { loginSchema, profileUpdateSchema, registerSchema, createLogger } from "@spill/shared";
import type { Environment } from "@spill/shared";
import { hashPassword, verifyPassword } from "./password.js";
import {
  authenticate,
  hashSessionToken,
  readSessionToken,
  requireRole,
  SESSION_COOKIE,
} from "./middleware.js";
import type { AuthStore, AuthUser } from "./types.js";
import type { EmailSender } from "@spill/shared/email";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const logger = createLogger("auth");

function setSessionCookie(
  response: import("express").Response,
  token: string,
  environment: Environment,
) {
  const secure = environment.NODE_ENV === "production" ? "; Secure" : "";
  response.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`,
  );
}

function clearSessionCookie(response: import("express").Response, environment: Environment) {
  const secure = environment.NODE_ENV === "production" ? "; Secure" : "";
  response.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailPreferences: user.emailPreferences,
    createdAt: user.createdAt,
  };
}

export function createAuthRouter(
  store: AuthStore,
  environment: Environment,
  emailSender: EmailSender | null = null,
) {
  const router = Router();
  const limitAuthenticationAttempts = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post("/auth/register", limitAuthenticationAttempts, async (request, response, next) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid registration details", details: parsed.error.flatten() });
      return;
    }
    try {
      const now = new Date();
      const user = await store.createUser({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: "reader",
        emailPreferences: { teaUpdates: true, productUpdates: false },
        createdAt: now,
      });
      let emailVerificationSent = false;
      if (store.createEmailVerification && emailSender) {
        const verificationToken = randomBytes(32).toString("base64url");
        const verifyUrl = new URL("/api/v1/auth/verify-email", environment.API_URL);
        verifyUrl.searchParams.set("token", verificationToken);
        await store.createEmailVerification(
          user.id,
          hashSessionToken(verificationToken),
          new Date(Date.now() + 86_400_000),
        );
        try {
          await emailSender.send({
            to: user.email,
            subject: "Verify your Spill email",
            html: `<p>Confirm this email address to receive Tea deliveries.</p><p><a href="${verifyUrl.toString()}">Verify email</a></p>`,
            text: `Confirm this email address to receive Tea deliveries: ${verifyUrl.toString()}`,
            idempotencyKey: `verify-${user.id}`,
          });
          emailVerificationSent = true;
        } catch (error) {
          logger.warn("Could not send email verification", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const token = randomBytes(32).toString("base64url");
      await store.createSession(
        hashSessionToken(token),
        user.id,
        new Date(Date.now() + SESSION_DURATION_MS),
      );
      setSessionCookie(response, token, environment);
      response.status(201).json({ user: publicUser(user), emailVerificationSent });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        response.status(409).json({ error: "An account with this email already exists" });
        return;
      }
      next(error);
    }
  });

  router.get("/auth/verify-email", async (request, response, next) => {
    const token = typeof request.query.token === "string" ? request.query.token : "";
    if (!token || !store.verifyEmail) {
      response.status(400).json({ error: "Invalid or expired verification link" });
      return;
    }
    try {
      const verified = await store.verifyEmail(hashSessionToken(token));
      if (!verified) {
        response.status(400).json({ error: "Invalid or expired verification link" });
        return;
      }
      response.status(200).json({
        status: "verified",
        message: "Email address verified. You can receive Tea deliveries.",
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/login", limitAuthenticationAttempts, async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid login details" });
      return;
    }
    try {
      const user = await store.findUserByEmail(parsed.data.email);
      if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      await store.createSession(
        hashSessionToken(token),
        user.id,
        new Date(Date.now() + SESSION_DURATION_MS),
      );
      setSessionCookie(response, token, environment);
      response.status(200).json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", async (request, response, next) => {
    try {
      const token = readSessionToken(request.headers.cookie);
      if (token) await store.deleteSession(hashSessionToken(token));
      clearSessionCookie(response, environment);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/me", authenticate(store), (request, response) => {
    response.json({ user: publicUser(request.authUser!) });
  });

  router.patch("/users/me", authenticate(store), async (request, response, next) => {
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid profile update", details: parsed.error.flatten() });
      return;
    }
    try {
      const updates: {
        name?: string;
        emailPreferences?: { teaUpdates?: boolean; productUpdates?: boolean };
      } = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      const preferences: { teaUpdates?: boolean; productUpdates?: boolean } = {};
      if (parsed.data.emailPreferences?.teaUpdates !== undefined) {
        preferences.teaUpdates = parsed.data.emailPreferences.teaUpdates;
      }
      if (parsed.data.emailPreferences?.productUpdates !== undefined) {
        preferences.productUpdates = parsed.data.emailPreferences.productUpdates;
      }
      if (Object.keys(preferences).length) updates.emailPreferences = preferences;
      const user = await store.updateProfile(request.authUser!.id, updates);
      if (!user) {
        response.status(404).json({ error: "Account not found" });
        return;
      }
      response.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/me", authenticate(store), requireRole("admin"), (request, response) => {
    logger.info("Admin identity checked", { userId: request.authUser!.id });
    response.json({ user: publicUser(request.authUser!) });
  });

  return router;
}
