import { Router, type Request } from "express";
import type { GenerationGraph, GenerationRoom } from "@spill/ai";
import type { AdminStore } from "../admin/types.js";
import type { GenerationStore } from "./types.js";

function routeParam(request: Request, key: string): string {
  const value = request.params[key];
  return typeof value === "string" ? value : "";
}

export function createGenerationRouter(
  store: AdminStore,
  generationStore: GenerationStore,
  graph: GenerationGraph | null,
) {
  const router = Router();
  router.get("/availability", (_request, response) =>
    response.json({ configured: graph !== null }),
  );
  router.post("/tea-rooms/:id/brew", async (request, response, next) => {
    if (Object.keys(request.body ?? {}).length) {
      response.status(400).json({ error: "Generation request does not accept a body" });
      return;
    }
    if (!graph) {
      response.status(503).json({
        error: "Generation is not configured. Set GROQ_API_KEY and GROQ_MODEL on the API server.",
      });
      return;
    }
    try {
      const room = await store.getTeaRoom(routeParam(request, "id"));
      if (!room) {
        response.status(404).json({ error: "Tea Room not found" });
        return;
      }
      if (room.status !== "active") {
        response.status(409).json({ error: "Only active Tea Rooms can be brewed" });
        return;
      }
      if (room.sips.length === 0) {
        response.status(409).json({ error: "Add at least one Sip before brewing" });
        return;
      }
      const generationRoom = room as GenerationRoom;
      const issueId = await generationStore.start(generationRoom, request.authUser!.id);
      try {
        const result = await graph.invoke(
          { input: { issueId, teaRoom: generationRoom, sips: room.sips } },
          { configurable: { thread_id: issueId } },
        );
        if (!result.output) throw new Error("Generation graph returned no result");
        await generationStore.complete(issueId, result.output);
        response.status(201).json(result.output);
      } catch (error) {
        await generationStore.fail(
          issueId,
          error instanceof Error ? error.message : "Generation failed",
        );
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });
  return router;
}
