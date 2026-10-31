import assert from "node:assert/strict";
import test from "node:test";
import { isScheduleDue, nextScheduleDate, scheduleCycleKey } from "./schedule.js";

test("schedule matching uses the Tea Room timezone and weekly calendar day", () => {
  const fridayAtNineUtc = new Date("2026-10-30T03:30:00.000Z");
  assert.equal(
    isScheduleDue(fridayAtNineUtc, "Asia/Kolkata", "weekly", { time: "09:00", weekday: "Friday" }),
    true,
  );
  assert.equal(
    isScheduleDue(fridayAtNineUtc, "UTC", "weekly", { time: "09:00", weekday: "Friday" }),
    false,
  );
  assert.equal(scheduleCycleKey(fridayAtNineUtc, "Asia/Kolkata"), "2026-10-30");
});

test("next schedule calculation handles daily and monthly schedules across timezones", () => {
  const nextDaily = nextScheduleDate(new Date("2026-10-30T05:00:00Z"), "Asia/Kolkata", "daily", {
    time: "09:00",
  });
  assert.equal(nextDaily.toISOString(), "2026-10-31T03:30:00.000Z");
  const nextMonth = nextScheduleDate(new Date("2026-10-31T04:00:00Z"), "Asia/Kolkata", "monthly", {
    time: "09:00",
    dayOfMonth: 5,
  });
  assert.equal(nextMonth.toISOString(), "2026-11-05T03:30:00.000Z");
});
