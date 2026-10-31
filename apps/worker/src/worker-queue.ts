import type { ConnectionOptions } from "bullmq";

export interface ScheduleJob {
  teaRoomId?: string;
  cycleKey?: string;
}
export interface DeliveryJob {
  issueId: string;
  scheduledAt: string;
}
export const DELIVERY_QUEUE_NAME = "spill-delivery";
export function connectRedis(value: string): ConnectionOptions {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
  };
}
