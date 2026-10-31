import { Queue } from "bullmq";

export interface DeliveryJob {
  issueId: string;
  scheduledAt: string;
}
export const DELIVERY_QUEUE_NAME = "spill-delivery";
export function createDeliveryQueue(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return new Queue<DeliveryJob>(DELIVERY_QUEUE_NAME, {
    connection: {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
      ...(parsed.pathname.length > 1 ? { db: Number(parsed.pathname.slice(1)) } : {}),
    },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}
