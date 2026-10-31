import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "./logger.js";

test("logger writes structured JSON and does not allow fields to overwrite metadata", () => {
  const original = console.log;
  let output = "";
  console.log = (message?: unknown) => {
    output = String(message);
  };
  try {
    createLogger("test", "debug").info("started", { requestId: "req-1", level: "error" });
  } finally {
    console.log = original;
  }
  const entry = JSON.parse(output) as Record<string, unknown>;
  assert.equal(entry.message, "started");
  assert.equal(entry.context, "test");
  assert.equal(entry.level, "info");
  assert.equal(entry.requestId, "req-1");
  assert.equal(typeof entry.timestamp, "string");
});

test("logger filters entries below its configured minimum level", () => {
  const original = console.log;
  let called = false;
  console.log = () => {
    called = true;
  };
  try {
    createLogger("test", "warn").info("hidden");
  } finally {
    console.log = original;
  }
  assert.equal(called, false);
});
