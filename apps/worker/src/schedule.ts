export interface SchedulePoint {
  time: string;
  weekday?: string;
  dayOfMonth?: number;
}
export type Frequency = "daily" | "weekly" | "monthly";
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function localScheduleKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isScheduleDue(
  date: Date,
  timezone: string,
  frequency: Frequency,
  point: SchedulePoint,
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  if (get("hour") !== point.time.slice(0, 2) || get("minute") !== point.time.slice(3, 5))
    return false;
  if (frequency === "weekly" && point.weekday !== get("weekday")) return false;
  if (frequency === "monthly" && Number(get("day")) !== point.dayOfMonth) return false;
  return true;
}

function addDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localToUtc(dateKey: string, time: string, timezone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let candidate = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const observedUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
    );
    candidate += targetUtc - observedUtc;
  }
  return new Date(candidate);
}

export function nextScheduleDate(
  after: Date,
  timezone: string,
  frequency: Frequency,
  point: SchedulePoint,
): Date {
  const localDate = localScheduleKey(after, timezone);
  const searchWindow = frequency === "monthly" ? 400 : 35;
  for (let offset = 0; offset <= searchWindow; offset += 1) {
    const dateKey = addDate(localDate, offset);
    const date = localToUtc(dateKey, point.time, timezone);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      day: "2-digit",
    }).formatToParts(date);
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (frequency === "weekly" && point.weekday !== weekday) continue;
    if (frequency === "monthly" && point.dayOfMonth !== day) continue;
    if (date.getTime() > after.getTime()) return date;
  }
  throw new Error("Could not calculate next scheduled time");
}

export function scheduleCycleKey(date: Date, timezone: string): string {
  return localScheduleKey(date, timezone);
}

export function localWeekday(date: Date, timezone: string) {
  return weekdays.indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date),
  );
}
