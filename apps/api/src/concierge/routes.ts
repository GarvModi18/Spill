import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { conciergeMessageSchema, conciergeProposalSchema } from "@spill/shared";
import { z } from "zod";
import type { ConciergeGraph } from "@spill/ai";
import type { AdminStore } from "../admin/types.js";
import type { ConciergeInput } from "@spill/ai";
import type { ConciergeStore, StoredProposal } from "./types.js";

const idSchema = z.uuid();
const proposalIdSchema = z.strictObject({ proposalId: z.uuid() });

function routeParam(request: Request, key: string): string {
  const value = request.params[key];
  return typeof value === "string" ? value : "";
}

function previewProposal(
  proposal: z.infer<typeof conciergeProposalSchema>,
  rooms: Awaited<ReturnType<AdminStore["listTeaRooms"]>>,
): string {
  const room =
    "teaRoomId" in proposal ? rooms.find((item) => item.id === proposal.teaRoomId) : null;
  const sip =
    "sipId" in proposal
      ? rooms.flatMap((item) => item.sips).find((item) => item.id === proposal.sipId)
      : null;
  const fields = (changes: Record<string, unknown>) =>
    Object.entries(changes)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
  switch (proposal.kind) {
    case "create_tea_room": {
      const config = proposal.config;
      return [
        "Create Tea Room",
        `Name: ${config.name}`,
        `Slug: ${config.slug}`,
        `Description: ${config.description}`,
        `Category and topics: ${config.category} · ${config.topics.join(", ") || "none"}`,
        `Audience: ${config.audience || "not specified"}`,
        `Editorial voice: ${config.editorialVoice || "not specified"}`,
        `Schedule: ${config.frequency} in ${config.timezone}`,
        `Generation: ${JSON.stringify(config.schedule.generation)}`,
        `Review deadline: ${JSON.stringify(config.schedule.reviewDeadline)}`,
        `Delivery: ${JSON.stringify(config.schedule.delivery)}`,
        `Default research: ${config.defaultResearchSettings.timeRangeDays} days · ${config.defaultResearchSettings.sources.map((source) => `${source.type}${source.enabled ? "" : " (disabled)"}`).join(", ") || "no sources"}`,
        `Email template: ${config.emailTemplate}`,
        `Public: ${config.isPublic ? "yes" : "no"}`,
      ].join("\n");
    }
    case "update_tea_room":
      return `Update “${room?.name ?? "Tea Room"}”:\n${fields(proposal.changes)}\nNo other fields will change.`;
    case "create_sip": {
      const sipConfig = proposal.sip;
      return [
        `Add Sip to ${room?.name ?? "the selected Tea Room"}`,
        `Title: ${sipConfig.title}`,
        `Description: ${sipConfig.description}`,
        `Type: ${sipConfig.type} · ${sipConfig.itemCount} items`,
        `Instructions: ${sipConfig.instructions}`,
        `Research: ${sipConfig.timeRangeDays} days · ${sipConfig.researchSources.map((source) => `${source.type}${source.enabled ? "" : " (disabled)"}`).join(", ") || "no sources"}`,
        `Writing style: ${sipConfig.writingStyle}`,
        `Content length: ${sipConfig.contentLength}`,
        `Output schema: ${JSON.stringify(sipConfig.outputSchema ?? {})}`,
      ].join("\n");
    }
    case "update_sip":
      return `Update Sip “${sip?.title ?? "Sip"}”:\n${fields(proposal.changes)}\nNo other fields will change.`;
    case "duplicate_sip":
      return `Duplicate “${sip?.title ?? "this Sip"}” and place the copy next to the original.`;
    case "delete_sip":
      return `Remove “${sip?.title ?? "this Sip"}” from ${rooms.find((item) => item.sips.some((entry) => entry.id === proposal.sipId))?.name ?? "its Tea Room"}.`;
  }
}

export function createConciergeRouter(
  chatStore: ConciergeStore,
  adminStore: AdminStore,
  graph: ConciergeGraph | null,
) {
  const router = Router();
  const messageLimit = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => request.authUser!.id,
  });

  router.get("/availability", (_request, response) => {
    response.json({ configured: graph !== null });
  });

  router.get("/sessions", async (request, response, next) => {
    try {
      response.json({ sessions: await chatStore.listSessions(request.authUser!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions", async (request, response, next) => {
    if (Object.keys(request.body ?? {}).length > 0) {
      response.status(400).json({ error: "Session creation does not accept a request body" });
      return;
    }
    try {
      response.status(201).json({ session: await chatStore.createSession(request.authUser!.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:threadId", async (request, response, next) => {
    const threadId = routeParam(request, "threadId");
    if (!idSchema.safeParse(threadId).success) {
      response.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    try {
      const session = await chatStore.getSession(request.authUser!.id, threadId);
      if (!session) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }
      response.json({ session });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:threadId/messages", messageLimit, async (request, response, next) => {
    const threadId = routeParam(request, "threadId");
    const parsed = conciergeMessageSchema.safeParse(request.body);
    if (!idSchema.safeParse(threadId).success || !parsed.success) {
      response.status(400).json({ error: "Invalid conversation id or message" });
      return;
    }
    if (!graph) {
      response.status(503).json({
        error:
          "Tea Concierge is not configured. Set GROQ_API_KEY and GROQ_MODEL on the API server.",
      });
      return;
    }
    try {
      const userId = request.authUser!.id;
      const session = await chatStore.getSession(userId, threadId);
      if (!session) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (
        session.pendingProposal?.status === "pending" ||
        session.pendingProposal?.status === "applying"
      ) {
        response
          .status(409)
          .json({ error: "Confirm or dismiss the pending configuration preview first." });
        return;
      }
      const rooms = await adminStore.listTeaRooms();
      const graphInput: ConciergeInput = {
        message: parsed.data.message,
        history: session.messages.map(({ role, content }) => ({ role, content })),
        teaRooms: rooms.map((room) => ({
          id: room.id,
          name: room.name,
          slug: room.slug,
          status: room.status,
          description: room.description,
          frequency: room.frequency,
          timezone: room.timezone,
          schedule: room.schedule,
          sips: room.sips.map((sip) => ({
            id: sip.id,
            title: sip.title,
            description: sip.description,
            type: sip.type,
          })),
        })),
      };
      const graphResult = await graph.invoke(
        { input: graphInput },
        { configurable: { thread_id: `${userId}:${threadId}` } },
      );
      const assistantMessage =
        graphResult.result?.assistantMessage ??
        "I’m ready to help configure a Tea Room or Sip. What would you like to change?";
      const proposal = graphResult.result?.proposal;
      const storedProposal: StoredProposal | null = proposal
        ? {
            id: randomUUID(),
            proposal,
            preview: previewProposal(proposal, rooms),
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null;
      const userMessage = {
        id: randomUUID(),
        role: "user" as const,
        content: parsed.data.message,
        createdAt: new Date(),
      };
      const updated = await chatStore.appendTurn(
        userId,
        threadId,
        userMessage,
        { intent: proposal ? "configuration" : "question", assistantMessage },
        storedProposal,
      );
      if (!updated) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }
      response.json({ session: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:threadId/confirm", async (request, response, next) => {
    const threadId = routeParam(request, "threadId");
    const parsed = proposalIdSchema.safeParse(request.body);
    if (!idSchema.safeParse(threadId).success || !parsed.success) {
      response.status(400).json({ error: "Invalid conversation or proposal id" });
      return;
    }
    const userId = request.authUser!.id;
    try {
      const claimed = await chatStore.claimProposal(userId, threadId, parsed.data.proposalId);
      const stored = claimed?.pendingProposal;
      if (!stored || stored.status !== "applying") {
        response.status(409).json({ error: "This proposal is no longer awaiting confirmation." });
        return;
      }
      const validated = conciergeProposalSchema.safeParse(stored.proposal);
      if (!validated.success) {
        await chatStore.setProposalStatus(userId, threadId, stored.id, "applying", "rejected");
        response.status(400).json({ error: "The stored proposal is invalid and was not applied." });
        return;
      }
      try {
        await applyProposal(adminStore, validated.data, userId);
        await chatStore.setProposalStatus(userId, threadId, stored.id, "applying", "confirmed");
        const session = await chatStore.appendAssistantMessage(
          userId,
          threadId,
          "Configuration updated. I’ve recorded the change in the audit log.",
        );
        response.json({ session });
      } catch (error) {
        await chatStore.setProposalStatus(userId, threadId, stored.id, "applying", "pending");
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/sessions/:threadId/reject", async (request, response, next) => {
    const threadId = routeParam(request, "threadId");
    const parsed = proposalIdSchema.safeParse(request.body);
    if (!idSchema.safeParse(threadId).success || !parsed.success) {
      response.status(400).json({ error: "Invalid conversation or proposal id" });
      return;
    }
    try {
      const userId = request.authUser!.id;
      const changed = await chatStore.setProposalStatus(
        userId,
        threadId,
        parsed.data.proposalId,
        "pending",
        "rejected",
      );
      if (!changed) {
        response.status(409).json({ error: "This proposal is no longer awaiting confirmation." });
        return;
      }
      const session = await chatStore.appendAssistantMessage(
        userId,
        threadId,
        "Preview dismissed. No configuration was changed.",
      );
      response.json({ session });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function applyProposal(
  store: AdminStore,
  proposal: z.infer<typeof conciergeProposalSchema>,
  actorId: string,
) {
  switch (proposal.kind) {
    case "create_tea_room":
      return store.createTeaRoom(proposal.config, actorId);
    case "update_tea_room": {
      const room = await store.updateTeaRoom(
        proposal.teaRoomId,
        proposal.changes as Parameters<AdminStore["updateTeaRoom"]>[1],
        actorId,
      );
      if (!room) throw Object.assign(new Error("Tea Room not found"), { statusCode: 404 });
      return room;
    }
    case "create_sip": {
      const sip = await store.createSip(proposal.teaRoomId, proposal.sip, actorId);
      if (!sip)
        throw Object.assign(new Error("Tea Room not found or cannot be changed"), {
          statusCode: 404,
        });
      return sip;
    }
    case "update_sip": {
      const sip = await store.updateSip(
        proposal.sipId,
        proposal.changes as Parameters<AdminStore["updateSip"]>[1],
        actorId,
      );
      if (!sip)
        throw Object.assign(new Error("Sip not found or cannot be changed"), { statusCode: 404 });
      return sip;
    }
    case "duplicate_sip": {
      const sip = await store.duplicateSip(proposal.sipId, actorId);
      if (!sip)
        throw Object.assign(new Error("Sip not found or cannot be duplicated"), {
          statusCode: 404,
        });
      return sip;
    }
    case "delete_sip": {
      const deleted = await store.deleteSip(proposal.sipId, actorId);
      if (!deleted)
        throw Object.assign(new Error("Sip not found or cannot be removed"), { statusCode: 404 });
      return;
    }
  }
}
