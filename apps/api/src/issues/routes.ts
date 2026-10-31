import { Router, type Request } from "express";
import { z } from "zod";
import type { Queue } from "bullmq";
import type { DeliveryJob } from "../delivery/queue.js";
import type { IssueStore } from "./types.js";

const editSchema = z.strictObject({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(20_000),
  expectedVersion: z.number().int().min(1),
});
const rejectSchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) });
const scheduleSchema = z.strictObject({ scheduledAt: z.iso.datetime() });
function param(request: Request, key: string) {
  const value = request.params[key];
  return typeof value === "string" ? value : "";
}

export function createIssueRouter(store: IssueStore, queue: Queue<DeliveryJob> | null = null) {
  const router = Router();
  router.get("/", async (request, response, next) => {
    try {
      const { teaRoomId, status } = request.query;
      response.json({
        issues: await store.list({
          ...(typeof teaRoomId === "string" ? { teaRoomId } : {}),
          ...(typeof status === "string" ? { status } : {}),
        }),
      });
    } catch (error) {
      next(error);
    }
  });
  router.get("/:issueId", async (request, response, next) => {
    try {
      const issue = await store.get(param(request, "issueId"));
      if (!issue) {
        response.status(404).json({ error: "Issue not found" });
        return;
      }
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  router.patch("/:issueId/sips/:issueSipId", async (request, response, next) => {
    const parsed = editSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Sip edit", details: parsed.error.flatten() });
      return;
    }
    try {
      const issue = await store.updateSip(
        param(request, "issueId"),
        param(request, "issueSipId"),
        request.authUser!.id,
        parsed.data,
      );
      if (!issue) {
        response
          .status(409)
          .json({ error: "Issue changed or is no longer editable. Reload before saving." });
        return;
      }
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:issueId/approve", async (request, response, next) => {
    if (Object.keys(request.body ?? {}).length) {
      response.status(400).json({ error: "Approval does not accept a request body" });
      return;
    }
    try {
      const issue = await store.approve(param(request, "issueId"), request.authUser!.id);
      if (!issue) {
        response.status(409).json({
          error:
            "Issue cannot be approved until it has editable, complete Sips and is awaiting review.",
        });
        return;
      }
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:issueId/reject", async (request, response, next) => {
    const parsed = rejectSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "A rejection reason is required" });
      return;
    }
    try {
      const issue = await store.reject(
        param(request, "issueId"),
        request.authUser!.id,
        parsed.data.reason,
      );
      if (!issue) {
        response.status(409).json({ error: "Issue is no longer awaiting review." });
        return;
      }
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:issueId/schedule", async (request, response, next) => {
    const parsed = scheduleSchema.safeParse(request.body);
    const scheduledAt = parsed.success ? new Date(parsed.data.scheduledAt) : null;
    if (
      !scheduledAt ||
      scheduledAt.getTime() <= Date.now() ||
      scheduledAt.getTime() > Date.now() + 365 * 86_400_000
    ) {
      response.status(400).json({ error: "Choose a delivery time in the next 365 days" });
      return;
    }
    if (!queue) {
      response.status(503).json({ error: "Delivery queue is unavailable" });
      return;
    }
    try {
      const issue = await store.schedule(
        param(request, "issueId"),
        request.authUser!.id,
        scheduledAt,
      );
      if (!issue) {
        response.status(409).json({ error: "Only an approved issue can be scheduled" });
        return;
      }
      const oldJob = await queue.getJob(`delivery-${issue.id}`);
      if (oldJob) await oldJob.remove();
      await queue.add(
        "deliver",
        { issueId: issue.id, scheduledAt: scheduledAt.toISOString() },
        { jobId: `delivery-${issue.id}`, delay: Math.max(0, scheduledAt.getTime() - Date.now()) },
      );
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:issueId/cancel", async (request, response, next) => {
    if (Object.keys(request.body ?? {}).length) {
      response.status(400).json({ error: "Cancellation does not accept a request body" });
      return;
    }
    try {
      const issue = await store.cancel(param(request, "issueId"), request.authUser!.id);
      if (!issue) {
        response.status(409).json({ error: "Issue is not scheduled" });
        return;
      }
      const job = await queue?.getJob(`delivery-${issue.id}`);
      if (job) await job.remove();
      response.json({ issue });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
