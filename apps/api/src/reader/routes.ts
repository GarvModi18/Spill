import { Router } from "express";
import { teaRoomSearchSchema } from "@spill/shared";
import { z } from "zod";
import { authenticate } from "../auth/middleware.js";
import type { AuthStore } from "../auth/types.js";
import type { ReaderStore } from "./types.js";

const issueSearchSchema = z.strictObject({
  search: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export function createReaderRouter(readerStore: ReaderStore, authStore: AuthStore) {
  const router = Router();
  const requireReader = authenticate(authStore);

  router.get("/tea-rooms", async (request, response, next) => {
    const parsed = teaRoomSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid Tea Room search", details: parsed.error.flatten() });
      return;
    }
    try {
      response.json(await readerStore.listPublicTeaRooms(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get("/tea-rooms/:slug", async (request, response, next) => {
    try {
      const slug = request.params.slug;
      const room = typeof slug === "string" ? await readerStore.findPublicTeaRoom(slug) : null;
      if (!room) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      response.json({ teaRoom: room });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tea-rooms/:id/issues", async (request, response, next) => {
    const parsed = issueSearchSchema.safeParse(request.query);
    if (
      !parsed.success ||
      (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)
    ) {
      response.status(400).json({ error: "Invalid archive filters" });
      return;
    }
    try {
      const id = request.params.id;
      const archive =
        typeof id === "string" ? await readerStore.listPublishedIssues(id, parsed.data) : null;
      if (!archive) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      response.json(archive);
    } catch (error) {
      next(error);
    }
  });

  router.get("/issues/:id", async (request, response, next) => {
    try {
      const id = request.params.id;
      const issue = typeof id === "string" ? await readerStore.getPublishedIssue(id) : null;
      if (!issue) {
        response.status(404).json({ error: "Tea not found" });
        return;
      }
      response.json({ tea: issue });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/me/subscriptions", requireReader, async (request, response, next) => {
    try {
      response.json({ subscriptions: await readerStore.listSubscriptions(request.authUser!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/me/dashboard", requireReader, async (request, response, next) => {
    try {
      const subscriptions = await readerStore.listSubscriptions(request.authUser!.id);
      const activeRoomIds = subscriptions
        .filter((subscription) => subscription.status === "active")
        .map((subscription) => subscription.teaRoom.id);
      const [recentTeas, nextPour] = await Promise.all([
        readerStore.listRecentIssues(activeRoomIds, 6),
        readerStore.listUpcomingIssues(activeRoomIds, 4),
      ]);
      response.json({ subscriptions, recentTeas, nextPour });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tea-rooms/:id/subscribe", requireReader, async (request, response, next) => {
    try {
      const id = request.params.id;
      const room = typeof id === "string" ? await readerStore.findPublicTeaRoomById(id) : null;
      if (!room) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      const result = await readerStore.subscribe(request.authUser!.id, room.id);
      response.status(result.created ? 201 : 200).json({ status: "active" });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/tea-rooms/:id/subscribe", requireReader, async (request, response, next) => {
    try {
      const id = request.params.id;
      if (typeof id === "string") {
        await readerStore.setSubscriptionStatus(request.authUser!.id, id, "unsubscribed");
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/tea-rooms/:id/pause", requireReader, async (request, response, next) => {
    try {
      const id = request.params.id;
      const changed =
        typeof id === "string" &&
        (await readerStore.setSubscriptionStatus(request.authUser!.id, id, "paused"));
      response
        .status(changed ? 200 : 404)
        .json(changed ? { status: "paused" } : { error: "Subscription not found" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tea-rooms/:id/resume", requireReader, async (request, response, next) => {
    try {
      const id = request.params.id;
      const changed =
        typeof id === "string" &&
        (await readerStore.setSubscriptionStatus(request.authUser!.id, id, "active"));
      response
        .status(changed ? 200 : 404)
        .json(changed ? { status: "active" } : { error: "Subscription not found" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
