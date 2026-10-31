import { MongoClient, ObjectId } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { Queue, Worker, type Job } from "bullmq";
import { createGenerationGraph, GroqGenerationModel, ResearchService } from "@spill/ai";
import { createLogger, parseEnvironment, type ResearchReceipt } from "@spill/shared";
import { createUnsubscribeToken, renderIssueEmail } from "@spill/shared/delivery";
import { ResendEmailSender } from "@spill/shared/email";
import {
  connectRedis,
  DELIVERY_QUEUE_NAME,
  type DeliveryJob,
  type ScheduleJob,
} from "./worker-queue.js";
import {
  isScheduleDue,
  nextScheduleDate,
  scheduleCycleKey,
  type Frequency,
  type SchedulePoint,
} from "./schedule.js";

interface TeaRoomDocument extends Record<string, unknown> {
  _id: ObjectId;
  status: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  topics: string[];
  audience: string;
  editorialVoice: string;
  timezone: string;
  frequency: Frequency;
  schedule: { generation: SchedulePoint; reviewDeadline: SchedulePoint; delivery: SchedulePoint };
}
interface SipConfigDocument extends Record<string, unknown> {
  _id: ObjectId;
  title: string;
  description: string;
  type: string;
  itemCount: number;
  instructions: string;
  order: number;
  researchSources: Array<{ type: string; url?: string; enabled: boolean }>;
  timeRangeDays: number;
  writingStyle: string;
  contentLength: string;
  outputSchema?: Record<string, unknown>;
}

const env = parseEnvironment();
const logger = createLogger("worker", env.LOG_LEVEL);
const mongo = await MongoClient.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const db = mongo.db();
const checkpointer = new MongoDBSaver({
  client: mongo,
  dbName: db.databaseName,
  checkpointCollectionName: "generationGraphCheckpoints",
  checkpointWritesCollectionName: "generationGraphCheckpointWrites",
});
const setupErrors = await checkpointer.setup();
if (setupErrors.length)
  throw new AggregateError(setupErrors, "Could not prepare generation graph checkpoints");
const redis = connectRedis(env.REDIS_URL);
const deliveryQueue = new Queue<DeliveryJob>(DELIVERY_QUEUE_NAME, {
  connection: connectRedis(env.REDIS_URL),
});
const scheduleQueue = new Queue<ScheduleJob>("spill-schedule", {
  connection: connectRedis(env.REDIS_URL),
});
const research = new ResearchService({
  ...(env.GITHUB_TOKEN ? { githubToken: env.GITHUB_TOKEN } : {}),
  ...(env.TAVILY_API_KEY ? { tavilyApiKey: env.TAVILY_API_KEY } : {}),
});
const graph =
  env.GROQ_API_KEY && env.GROQ_MODEL
    ? createGenerationGraph(
        { research, model: new GroqGenerationModel(env.GROQ_API_KEY, env.GROQ_MODEL) },
        checkpointer,
      )
    : null;
const emailSender =
  env.RESEND_API_KEY && env.EMAIL_FROM
    ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : null;

const scheduleWorker = new Worker<ScheduleJob>(
  "spill-schedule",
  async (job) => {
    if (job.name === "scan") await scanSchedules();
    else if (job.name === "generate-room" && job.data.teaRoomId && job.data.cycleKey)
      await generateRoom(job.data.teaRoomId, job.data.cycleKey);
  },
  { connection: connectRedis(env.REDIS_URL), concurrency: 2 },
);

const deliveryWorker = new Worker<DeliveryJob>(DELIVERY_QUEUE_NAME, deliverIssue, {
  connection: connectRedis(env.REDIS_URL),
  concurrency: 1,
  limiter: { max: 5, duration: 1000 },
});

async function scanSchedules() {
  const now = new Date();
  const rooms = await db
    .collection<TeaRoomDocument>("teaRooms")
    .find({ status: "active" })
    .toArray();
  for (const room of rooms) {
    if (graph && isScheduleDue(now, room.timezone, room.frequency, room.schedule.generation)) {
      const cycleKey = scheduleCycleKey(now, room.timezone);
      await scheduleQueue.add(
        "generate-room",
        { teaRoomId: room._id.toHexString(), cycleKey },
        {
          jobId: `generation-${room._id.toHexString()}-${cycleKey}`,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    }
    if (isScheduleDue(now, room.timezone, room.frequency, room.schedule.delivery)) {
      const approved = await db
        .collection<{ _id: ObjectId; approvedAt: Date }>("newsletterIssues")
        .find({ teaRoomId: room._id, status: "approved", approvedAt: { $lte: now } })
        .sort({ approvedAt: 1 })
        .limit(20)
        .toArray();
      for (const issue of approved) {
        const scheduledAt = new Date(now);
        const changed = await db
          .collection("newsletterIssues")
          .updateOne(
            { _id: issue._id, status: "approved" },
            { $set: { status: "scheduled", scheduledAt, updatedAt: now } },
          );
        if (changed.modifiedCount)
          await deliveryQueue.add(
            "deliver",
            { issueId: issue._id.toHexString(), scheduledAt: scheduledAt.toISOString() },
            {
              jobId: `delivery-${issue._id.toHexString()}`,
              attempts: 5,
              backoff: { type: "exponential", delay: 30_000 },
            },
          );
      }
    }
  }
  const overdue = await db
    .collection("newsletterIssues")
    .find({ status: { $in: ["review", "partial"] }, reviewDeadlineAt: { $lte: now } })
    .toArray();
  for (const issue of overdue) {
    const result = await db
      .collection("newsletterIssues")
      .updateOne(
        { _id: issue._id, status: { $in: ["review", "partial"] } },
        { $set: { status: "review_missed", updatedAt: now } },
      );
    if (result.modifiedCount) {
      await db.collection("adminNotifications").insertOne({
        type: "review_deadline_missed",
        issueId: issue._id,
        teaRoomId: issue.teaRoomId,
        createdAt: now,
        readAt: null,
      });
      await db.collection("auditLogs").insertOne({
        action: "issue.review_deadline_missed",
        entityType: "newsletterIssue",
        entityId: issue._id,
        details: {},
        createdAt: now,
      });
    }
  }
}

async function generateRoom(teaRoomId: string, cycleKey: string) {
  if (!graph) throw new Error("Generation is not configured");
  const roomId = new ObjectId(teaRoomId);
  const room = await db
    .collection<TeaRoomDocument>("teaRooms")
    .findOne({ _id: roomId, status: "active" });
  if (!room) return;
  const sips = await db
    .collection<SipConfigDocument>("sipConfigs")
    .find({ teaRoomId: roomId })
    .sort({ order: 1 })
    .toArray();
  if (!sips.length) return;
  const issueCollection = db.collection("newsletterIssues");
  const existing = await issueCollection.findOne({ teaRoomId: roomId, generationKey: cycleKey });
  if (existing) return;
  const now = new Date();
  const issueId = new ObjectId();
  const roomConfig = { id: roomId.toHexString(), ...room } as never;
  await issueCollection.insertOne({
    _id: issueId,
    teaRoomId: roomId,
    title: `${room.name} · ${cycleKey}`,
    status: "generating",
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    generationRunId: issueId.toHexString(),
    generationKey: cycleKey,
    generationStartedAt: now,
  });
  await db.collection("generationRuns").insertOne({
    _id: new ObjectId(),
    issueId,
    teaRoomId: roomId,
    status: "running",
    startedAt: now,
    graphThreadId: issueId.toHexString(),
    modelVersion: env.GROQ_MODEL ?? "unconfigured",
  });
  try {
    const result = await graph.invoke(
      {
        input: {
          issueId: issueId.toHexString(),
          teaRoom: roomConfig,
          sips: sips.map((sip) => ({ ...sip, id: sip._id.toHexString() }) as never),
        },
      },
      { configurable: { thread_id: issueId.toHexString() } },
    );
    if (!result.output) throw new Error("Generation graph returned no result");
    const deadline = nextScheduleDate(
      now,
      room.timezone,
      room.frequency,
      room.schedule.reviewDeadline,
    );
    const completedAt = new Date(result.output.completedAt);
    await issueCollection.updateOne(
      { _id: issueId },
      {
        $set: {
          status: result.output.status,
          updatedAt: completedAt,
          generationCompletedAt: completedAt,
          reviewDeadlineAt: deadline,
          generationSummary: {
            totalSips: result.output.sips.length,
            failedSips: result.output.sips.filter((sip) => sip.status === "failed").length,
          },
        },
      },
    );
    const sipDocs = result.output.sips.map((sip) => ({
      _id: new ObjectId(),
      issueId,
      sipId: new ObjectId(sip.sipId),
      title: sip.title,
      description: sip.description,
      order: sip.order,
      status: sip.status,
      content: sip.content,
      items: sip.items,
      qualityIssues: sip.qualityIssues,
      error: sip.error,
      modelVersion: sip.modelVersion,
      promptVersion: sip.promptVersion,
      attempts: sip.attempts,
      version: 1,
      updatedAt: completedAt,
    }));
    if (sipDocs.length) {
      await db.collection("issueSips").insertMany(sipDocs);
      await db.collection("issueSipVersions").insertMany(
        sipDocs.map((sip) => ({
          _id: new ObjectId(),
          issueId,
          issueSipId: sip._id,
          version: 1,
          title: sip.title,
          content: sip.content,
          changedBy: null,
          reason: "generation",
          createdAt: completedAt,
        })),
      );
    }
    const receipts = result.output.sips.flatMap((sip) =>
      sip.receipts.map((receipt: ResearchReceipt) => ({
        ...receipt,
        _id: new ObjectId(),
        issueId,
        sipId: new ObjectId(sip.sipId),
        retrievedAt: new Date(receipt.retrievedAt),
        publishedAt: receipt.publishedAt ? new Date(receipt.publishedAt) : null,
      })),
    );
    if (receipts.length) await db.collection("researchSources").insertMany(receipts);
    await db.collection("generationRuns").updateOne(
      { issueId },
      {
        $set: {
          status: result.output.status,
          finishedAt: completedAt,
          resultSummary: {
            totalSips: result.output.sips.length,
            failedSips: result.output.sips.filter((sip) => sip.status === "failed").length,
          },
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Generation failed";
    await issueCollection.updateOne(
      { _id: issueId },
      { $set: { status: "generation_failed", updatedAt: new Date(), error: message } },
    );
    await db
      .collection("generationRuns")
      .updateOne(
        { issueId },
        { $set: { status: "generation_failed", finishedAt: new Date(), error: message } },
      );
    throw error;
  }
}

async function deliverIssue(job: Job<DeliveryJob>) {
  const { issueId } = job.data;
  const id = new ObjectId(issueId);
  const issues = db.collection("newsletterIssues");
  const issue = await issues.findOne<{
    _id: ObjectId;
    teaRoomId: ObjectId;
    title: string;
    approvedAt?: Date;
    scheduledAt?: Date;
  }>({ _id: id, status: { $in: ["scheduled", "sending"] }, approvedAt: { $type: "date" } });
  if (!issue) return;
  const now = new Date();
  if (issue.scheduledAt instanceof Date && issue.scheduledAt > now) {
    await deliveryQueue.add(
      "deliver",
      { issueId, scheduledAt: issue.scheduledAt.toISOString() },
      {
        jobId: `delivery-${issueId}-${issue.scheduledAt.getTime()}`,
        delay: issue.scheduledAt.getTime() - now.getTime(),
      },
    );
    return;
  }
  await issues.updateOne(
    { _id: id, status: "scheduled", approvedAt: { $type: "date" } },
    { $set: { status: "sending", updatedAt: now } },
  );
  const issueSips = await db
    .collection<{ title: string; content?: string }>("issueSips")
    .find({ issueId: id })
    .sort({ order: 1 })
    .toArray();
  const teaRoom = await db
    .collection<{ _id: ObjectId; name: string; slug: string }>("teaRooms")
    .findOne({ _id: issue.teaRoomId });
  if (!teaRoom) throw new Error("Tea Room was not found");
  if (!emailSender || !env.EMAIL_FROM) throw new Error("Email provider is not configured");
  const unsubscribeSecret = env.UNSUBSCRIBE_SECRET ?? env.AUTH_SECRET;
  if (!unsubscribeSecret) throw new Error("UNSUBSCRIBE_SECRET or AUTH_SECRET must be configured");
  const subscriptions = await db
    .collection<{ userId: ObjectId }>("subscriptions")
    .find({ teaRoomId: issue.teaRoomId, status: "active" })
    .toArray();
  const userIds = subscriptions.map(({ userId }) => userId);
  const users = await db
    .collection<{
      _id: ObjectId;
      email: string;
      name: string;
      emailVerified?: boolean;
      emailPreferences?: { teaUpdates?: boolean };
    }>("users")
    .find({
      _id: { $in: userIds },
      emailVerified: true,
      "emailPreferences.teaUpdates": { $ne: false },
    })
    .toArray();
  const deliveries = db.collection("emailDeliveries");
  const sections = issueSips.map((sip) => ({ title: sip.title, content: sip.content ?? "" }));
  const sendErrors: string[] = [];
  let providerCalls = 0;
  for (const user of users) {
    const [currentUser, activeSubscription, suppression] = await Promise.all([
      db
        .collection<{
          _id: ObjectId;
          emailVerified?: boolean;
          emailPreferences?: { teaUpdates?: boolean };
        }>("users")
        .findOne({ _id: user._id }),
      db
        .collection("subscriptions")
        .findOne({ userId: user._id, teaRoomId: issue.teaRoomId, status: "active" }),
      db.collection("emailSuppressions").findOne({ email: user.email.toLowerCase() }),
    ]);
    if (
      !currentUser?.emailVerified ||
      currentUser.emailPreferences?.teaUpdates === false ||
      !activeSubscription ||
      suppression
    )
      continue;
    const existing = await deliveries.findOne({ issueId: id, userId: user._id });
    if (existing?.status === "sent" || existing?.status === "delivered") continue;
    if (!existing) {
      try {
        await deliveries.insertOne({
          _id: new ObjectId(),
          issueId: id,
          teaRoomId: issue.teaRoomId,
          userId: user._id,
          email: user.email,
          status: "queued",
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        if (!(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ))
          throw error;
      }
    }
    const current = await deliveries.findOne({ issueId: id, userId: user._id });
    if (!current || current.status === "sent" || current.status === "delivered") continue;
    if (providerCalls > 0 && providerCalls % 5 === 0)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    await deliveries.updateOne(
      { _id: current._id },
      { $set: { status: "queued", updatedAt: new Date() }, $inc: { attempts: 1 } },
    );
    const unsubscribeToken = createUnsubscribeToken(
      unsubscribeSecret,
      user._id.toHexString(),
      issue.teaRoomId.toHexString(),
    );
    const unsubscribeUrl = new URL("/api/v1/unsubscribe", env.API_URL);
    unsubscribeUrl.searchParams.set("token", unsubscribeToken);
    const readerUrl = new URL(
      `/tea-rooms/${encodeURIComponent(teaRoom.slug)}/issues/${issueId}`,
      env.READER_WEB_URL,
    ).toString();
    const rendered = renderIssueEmail({
      roomName: teaRoom.name,
      issueTitle: issue.title,
      sections,
      unsubscribeUrl: unsubscribeUrl.toString(),
      readerUrl,
    });
    try {
      providerCalls += 1;
      const sent = await emailSender.send({
        to: user.email,
        subject: issue.title,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `spill-${issueId}-${user._id.toHexString()}`,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl.toString()}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await deliveries.updateOne(
        { _id: current._id },
        {
          $set: {
            status: "sent",
            providerMessageId: sent.messageId,
            sentAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );
    } catch (error) {
      await deliveries.updateOne(
        { _id: current._id },
        {
          $set: {
            status: "failed",
            lastError: error instanceof Error ? error.message.slice(0, 300) : "Email send failed",
            updatedAt: new Date(),
          },
        },
      );
      sendErrors.push(error instanceof Error ? error.message : "Email send failed");
    }
  }
  if (sendErrors.length && job.attemptsMade + 1 < (job.opts.attempts ?? 1))
    throw new AggregateError(
      sendErrors.map((message) => new Error(message)),
      "One or more recipient deliveries failed",
    );
  const counts = await deliveries
    .aggregate<{ status: string; count: number }>([
      { $match: { issueId: id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ])
    .toArray();
  const failed = counts.some(
    ({ status }) => status === "failed" || status === "bounced" || status === "complained",
  );
  const pending = counts.some(({ status }) => status === "queued");
  const publishedStatus = failed || pending ? "partially_delivered" : "published";
  await issues.updateOne(
    { _id: id, status: "sending", approvedAt: { $type: "date" } },
    {
      $set: {
        status: publishedStatus,
        publishedAt: new Date(),
        updatedAt: new Date(),
        deliverySummary: counts,
      },
    },
  );
  await db.collection("auditLogs").insertOne({
    action: "issue.delivery_completed",
    entityType: "newsletterIssue",
    entityId: id,
    details: { status: publishedStatus, deliverySummary: counts },
    createdAt: new Date(),
  });
}

await scheduleQueue.upsertJobScheduler(
  "schedule-scan",
  { every: 60_000 },
  { name: "scan", data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
scheduleWorker.on("failed", (job, error) =>
  logger.error("Scheduled worker job failed", {
    jobId: job?.id,
    jobName: job?.name,
    error: error.message,
  }),
);
deliveryWorker.on("failed", async (job, error) => {
  logger.error("Delivery job failed", {
    jobId: job?.id,
    error: error.message,
    attemptsMade: job?.attemptsMade,
  });
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const issueId = new ObjectId(job.data.issueId);
    const delivered = await db
      .collection("emailDeliveries")
      .countDocuments({ issueId, status: { $in: ["sent", "delivered"] } });
    await db.collection("newsletterIssues").updateOne(
      { _id: issueId, status: "sending" },
      {
        $set: {
          status: delivered ? "partially_delivered" : "delivery_failed",
          deliveryError: error.message.slice(0, 300),
          updatedAt: new Date(),
        },
      },
    );
  }
});

logger.info("Worker started", {
  generationConfigured: graph !== null,
  emailConfigured: emailSender !== null,
});
const shutdown = async (signal: string) => {
  logger.info("Shutting down worker", { signal });
  await Promise.all([
    scheduleWorker.close(),
    deliveryWorker.close(),
    scheduleQueue.close(),
    deliveryQueue.close(),
    redis.quit(),
  ]);
  await mongo.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
