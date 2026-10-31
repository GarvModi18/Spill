import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import { createConciergeGraph } from "./graph.js";
import type { ConciergeModel } from "./types.js";

const input = {
  message: "Create a weekly technology room",
  history: [],
  teaRooms: [],
};

test("configuration graph returns a clarification without creating an action", async () => {
  const model: ConciergeModel = {
    respond: async () => ({ intent: "question", assistantMessage: "What timezone should it use?" }),
  };
  const graph = createConciergeGraph(model, new MemorySaver());
  const result = await graph.invoke({ input }, { configurable: { thread_id: "test-question" } });
  assert.equal(result.result?.assistantMessage, "What timezone should it use?");
  assert.equal(result.result?.proposal, undefined);
});

test("configuration graph drops proposals that fail shared validation", async () => {
  const model: ConciergeModel = {
    respond: async () =>
      ({
        intent: "configuration",
        assistantMessage: "Here is the proposed Sip.",
        proposal: { kind: "create_sip", teaRoomId: "room-1", sip: { itemCount: 0 } },
      }) as never,
  };
  const graph = createConciergeGraph(model, new MemorySaver());
  const result = await graph.invoke({ input }, { configurable: { thread_id: "test-invalid" } });
  assert.equal(result.result?.proposal, undefined);
  assert.match(result.result?.assistantMessage ?? "", /couldn’t validate/i);
});
