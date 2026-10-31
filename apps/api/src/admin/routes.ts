import { Router } from "express";
import {
  adminTeaRoomPatchSchema,
  adminTeaRoomSchema,
  sipConfigCreateSchema,
  sipConfigPatchSchema,
} from "@spill/shared";
import { z } from "zod";
import type { Request } from "express";
import { authenticate, requireRole } from "../auth/middleware.js";
import type { AuthStore } from "../auth/types.js";
import { AdminStoreError, type AdminStore } from "./types.js";
import type { ConciergeGraph } from "@spill/ai";
import { createConciergeRouter } from "../concierge/routes.js";
import type { ConciergeStore } from "../concierge/types.js";
import { createResearchRouter } from "../research/routes.js";
import type { ResearchService } from "@spill/ai";
import type { ResearchStore } from "../research/types.js";
import { createGenerationRouter } from "../generation/routes.js";
import type { GenerationGraph } from "@spill/ai";
import type { GenerationStore } from "../generation/types.js";

function respondToError(
  error: unknown,
  response: import("express").Response,
  next: import("express").NextFunction,
) {
  if (error instanceof AdminStoreError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    response.status(409).json({ error: "A Tea Room with that slug already exists" });
    return;
  }
  next(error);
}

const sipOrderSchema = z.strictObject({ sipIds: z.array(z.string().min(1)).min(1).max(50) });

function routeParam(request: Request, key: string): string {
  const value = request.params[key];
  return typeof value === "string" ? value : "";
}

export function createAdminRouter(
  store: AdminStore,
  authStore: AuthStore,
  conciergeStore: ConciergeStore | null = null,
  conciergeGraph: ConciergeGraph | null = null,
  researchService: ResearchService | null = null,
  researchStore: ResearchStore | null = null,
  generationGraph: GenerationGraph | null = null,
  generationStore: GenerationStore | null = null,
) {
  const router = Router();
  router.use(authenticate(authStore), requireRole("admin"));

  if (conciergeStore) {
    router.use("/concierge", createConciergeRouter(conciergeStore, store, conciergeGraph));
  }
  if (researchService && researchStore) {
    router.use("/research", createResearchRouter(store, researchService, researchStore));
  }
  if (generationStore) {
    router.use("/generation", createGenerationRouter(store, generationStore, generationGraph));
  }

  router.get("/dashboard", async (_request, response, next) => {
    try {
      response.json(await store.getDashboard());
    } catch (error) {
      next(error);
    }
  });

  router.get("/tea-rooms", async (_request, response, next) => {
    try {
      response.json({ teaRooms: await store.listTeaRooms() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tea-rooms", async (request, response, next) => {
    const parsed = adminTeaRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid Tea Room configuration", details: parsed.error.flatten() });
      return;
    }
    try {
      response
        .status(201)
        .json({ teaRoom: await store.createTeaRoom(parsed.data, request.authUser!.id) });
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  router.get("/tea-rooms/:id", async (request, response, next) => {
    try {
      const room = await store.getTeaRoom(routeParam(request, "id"));
      if (!room) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      response.json({ teaRoom: room });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/tea-rooms/:id", async (request, response, next) => {
    const parsed = adminTeaRoomPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid Tea Room update", details: parsed.error.flatten() });
      return;
    }
    try {
      const room = await store.updateTeaRoom(
        routeParam(request, "id"),
        parsed.data as Parameters<AdminStore["updateTeaRoom"]>[1],
        request.authUser!.id,
      );
      if (!room) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      response.json({ teaRoom: room });
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  for (const action of ["activate", "pause", "archive"] as const) {
    router.post(`/tea-rooms/:id/${action}`, async (request, response, next) => {
      try {
        const room = await store.transitionTeaRoom(
          routeParam(request, "id"),
          action,
          request.authUser!.id,
        );
        if (!room) {
          response.status(404).json({ error: "Tea Room not found" });
          return;
        }
        response.json({ teaRoom: room });
      } catch (error) {
        respondToError(error, response, next);
      }
    });
  }

  router.post("/tea-rooms/:id/sips", async (request, response, next) => {
    const parsed = sipConfigCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid Sip configuration", details: parsed.error.flatten() });
      return;
    }
    try {
      const sip = await store.createSip(
        routeParam(request, "id"),
        parsed.data,
        request.authUser!.id,
      );
      if (!sip) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      response.status(201).json({ sip });
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  router.put("/tea-rooms/:id/sips/order", async (request, response, next) => {
    const parsed = sipOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Sip order" });
      return;
    }
    try {
      const updated = await store.reorderSips(
        routeParam(request, "id"),
        parsed.data.sipIds,
        request.authUser!.id,
      );
      response
        .status(updated ? 200 : 400)
        .json(
          updated ? { status: "ordered" } : { error: "Sip order does not match this Tea Room" },
        );
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  router.patch("/sips/:sipId", async (request, response, next) => {
    const parsed = sipConfigPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Sip update", details: parsed.error.flatten() });
      return;
    }
    try {
      const sip = await store.updateSip(
        routeParam(request, "sipId"),
        parsed.data as Parameters<AdminStore["updateSip"]>[1],
        request.authUser!.id,
      );
      if (!sip) {
        response.status(404).json({ error: "Sip not found" });
        return;
      }
      response.json({ sip });
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  router.post("/sips/:sipId/duplicate", async (request, response, next) => {
    try {
      const sip = await store.duplicateSip(routeParam(request, "sipId"), request.authUser!.id);
      if (!sip) {
        response.status(404).json({ error: "Sip not found" });
        return;
      }
      response.status(201).json({ sip });
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  router.delete("/sips/:sipId", async (request, response, next) => {
    try {
      const deleted = await store.deleteSip(routeParam(request, "sipId"), request.authUser!.id);
      if (!deleted) {
        response.status(404).json({ error: "Sip not found" });
        return;
      }
      response.status(204).end();
    } catch (error) {
      respondToError(error, response, next);
    }
  });

  return router;
}
