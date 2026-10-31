import { Router } from "express";
import { researchSearchRequestSchema } from "@spill/shared";
import type { AdminStore } from "../admin/types.js";
import type { ResearchService } from "@spill/ai";
import type { ResearchStore } from "./types.js";

export function createResearchRouter(
  adminStore: AdminStore,
  researchService: ResearchService,
  researchStore: ResearchStore,
) {
  const router = Router();
  router.post("/search", async (request, response, next) => {
    const parsed = researchSearchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Invalid research request", details: parsed.error.flatten() });
      return;
    }
    try {
      const rooms = await adminStore.listTeaRooms();
      const room = rooms.find((candidate) =>
        candidate.sips.some((sip) => sip.id === parsed.data.sipId),
      );
      const sip = room?.sips.find((candidate) => candidate.id === parsed.data.sipId);
      if (!room || !sip) {
        response.status(404).json({ error: "Sip not found" });
        return;
      }
      const sources = sip.researchSources.filter((source) => source.enabled);
      if (sources.length === 0) {
        response.status(400).json({ error: "Enable at least one research source for this Sip" });
        return;
      }
      const result = await researchService.search(sources, {
        query: parsed.data.query,
        maxResults: parsed.data.maxResults,
        timeRangeDays: sip.timeRangeDays,
      });
      const run = await researchStore.save(
        {
          teaRoomId: room.id,
          sipId: sip.id,
          query: parsed.data.query,
          requestedBy: request.authUser!.id,
        },
        result,
      );
      response.json({ run, ...result });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
