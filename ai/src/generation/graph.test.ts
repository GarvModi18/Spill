import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import { createGenerationGraph } from "./graph.js";
import type { GenerationInput, GenerationModel } from "./types.js";

const room = {
  id: "room-1",
  name: "Tech",
  description: "Technology briefing",
  topics: ["TypeScript"],
} as never;
function sip(id: string, title: string) {
  return {
    id,
    title,
    description: "Recent changes",
    type: "research_summary",
    itemCount: 1,
    instructions: "Use evidence",
    order: 0,
    researchSources: [],
    timeRangeDays: 7,
    writingStyle: "Clear",
    contentLength: "short",
  } as never;
}

test("generation graph researches each Sip and flags unsupported claims for review", async () => {
  const research = {
    search: async () => ({
      receipts: [
        {
          url: "https://example.com/source",
          title: "Source",
          sourceName: "Example",
          retrievedAt: new Date().toISOString(),
          snippet: "Evidence",
          sourceType: "github" as const,
          verificationStatus: "unverified" as const,
        },
      ],
      failures: [],
      retrievedAt: new Date().toISOString(),
    }),
  };
  const model: GenerationModel = {
    modelVersion: "mock-model",
    generate: async () => ({
      items: [
        {
          title: "Update",
          content: "A concise update.",
          claims: [{ claim: "Unsupported", supported: false, evidenceUrls: [] }],
        },
      ],
    }),
  };
  const graph = createGenerationGraph({ research, model }, new MemorySaver());
  const input: GenerationInput = {
    issueId: "issue-1",
    teaRoom: room,
    sips: [sip("sip-1", "Updates")],
  };
  const result = await graph.invoke({ input }, { configurable: { thread_id: "generation-1" } });
  assert.equal(result.output?.status, "review");
  assert.equal(result.output?.sips[0]?.status, "needs_review");
  assert.equal(result.output?.sips[0]?.receipts.length, 1);
  assert.equal(result.output?.sips[0]?.qualityIssues[0]?.code, "unsupported_claim");
});

test("generation graph preserves successful Sips when another Sip model call fails", async () => {
  const research = {
    search: async () => ({ receipts: [], failures: [], retrievedAt: new Date().toISOString() }),
  };
  const model: GenerationModel = {
    modelVersion: "mock-model",
    generate: async ({ sip: selected }) => {
      if (selected.id === "bad") throw new Error("model unavailable");
      return { items: [{ title: "One", content: "Content", claims: [] }] };
    },
  };
  const graph = createGenerationGraph({ research, model }, new MemorySaver());
  const result = await graph.invoke(
    {
      input: {
        issueId: "issue-2",
        teaRoom: room,
        sips: [sip("good", "Good"), sip("bad", "Bad")],
      },
    },
    { configurable: { thread_id: "generation-2" } },
  );
  assert.equal(result.output?.status, "partial");
  assert.deepEqual(
    result.output?.sips.map(({ status }) => status),
    ["ready_for_review", "failed"],
  );
  assert.equal(result.output?.sips[1]?.attempts, 2);
});
