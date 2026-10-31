import { Router, type Request } from "express";
import { z } from "zod";
import type { IssueStore } from "./types.js";

const editSchema = z.strictObject({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(20_000),
  expectedVersion: z.number().int().min(1),
});
const rejectSchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) });
function param(request: Request, key: string) {
  const value = request.params[key];
  return typeof value === "string" ? value : "";
}

export function createIssueRouter(store: IssueStore) {
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
  return router;
}
