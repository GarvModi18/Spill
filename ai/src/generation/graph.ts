import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import type { ResearchReceipt } from "@spill/shared";
import { ResearchService } from "../research/service.js";
import type {
  GenerationDependencies,
  GenerationInput,
  GenerationResult,
  GenerationSipResult,
} from "./types.js";
import { GENERATION_PROMPT_VERSION } from "./prompt.js";

const generationState = new StateSchema({
  input: z.custom<GenerationInput>(),
  output: z.custom<GenerationResult>().optional(),
});
const draftSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(300),
        content: z.string().trim().min(1).max(8000),
        claims: z
          .array(
            z.strictObject({
              claim: z.string().trim().min(1).max(1000),
              supported: z.boolean(),
              evidenceUrls: z.array(z.url()).max(20),
            }),
          )
          .max(50),
      }),
    )
    .max(20),
});

export function createGenerationGraph(
  dependencies: GenerationDependencies,
  checkpointer: BaseCheckpointSaver,
) {
  const research = dependencies.research ?? new ResearchService();
  return new StateGraph(generationState)
    .addNode("generate_sips", async ({ input }) => {
      const results = await mapLimit(
        input.sips,
        Math.min(5, Math.max(1, input.maxConcurrency ?? 3)),
        async (sip) => {
          let receipts: ResearchReceipt[] = [];
          let attempts = 0;
          try {
            const query = [sip.title, sip.description, input.teaRoom.topics.join(" ")]
              .filter(Boolean)
              .join(" ")
              .slice(0, 500);
            const researchResult = await research.search(sip.researchSources, {
              query,
              maxResults: sip.itemCount,
              timeRangeDays: sip.timeRangeDays,
            });
            receipts = researchResult.receipts;
            let draft;
            let lastError: unknown;
            for (attempts = 1; attempts <= 2; attempts += 1) {
              try {
                draft = draftSchema.parse(
                  await dependencies.model.generate({
                    teaRoom: input.teaRoom,
                    sip,
                    query,
                    receipts,
                  }),
                );
                break;
              } catch (error) {
                lastError = error;
              }
            }
            if (!draft) {
              attempts = 2;
              throw lastError ?? new Error("Generation failed");
            }
            const allowedUrls = new Set(receipts.map((receipt) => receipt.url));
            const qualityIssues: GenerationSipResult["qualityIssues"] = [];
            if (sip.researchSources.some((source) => source.enabled) && receipts.length === 0) {
              qualityIssues.push({
                code: "no_evidence",
                message: "No research evidence was collected; factual claims need manual review.",
              });
            }
            if (draft.items.length !== sip.itemCount)
              qualityIssues.push({
                code: "item_count",
                message: `Expected ${sip.itemCount} items, received ${draft.items.length}.`,
              });
            for (const item of draft.items) {
              if (!item.content.trim())
                qualityIssues.push({ code: "empty_content", message: "An item has no content." });
              for (const claim of item.claims) {
                if (!claim.supported)
                  qualityIssues.push({
                    code: "unsupported_claim",
                    message: `Unsupported claim: ${claim.claim}`,
                  });
                if (claim.evidenceUrls.some((url) => !allowedUrls.has(url)))
                  qualityIssues.push({
                    code: "unknown_evidence",
                    message: `Claim references evidence outside the research results: ${claim.claim}`,
                  });
              }
            }
            return {
              sipId: sip.id,
              title: sip.title,
              description: sip.description,
              order: sip.order,
              status: qualityIssues.length
                ? ("needs_review" as const)
                : ("ready_for_review" as const),
              content: draft.items.map((item) => item.content).join("\n\n"),
              items: draft.items,
              receipts,
              qualityIssues,
              modelVersion: dependencies.model.modelVersion,
              promptVersion: GENERATION_PROMPT_VERSION,
              attempts,
            };
          } catch (error) {
            return {
              sipId: sip.id,
              title: sip.title,
              description: sip.description,
              order: sip.order,
              status: "failed" as const,
              content: "",
              items: [],
              receipts,
              qualityIssues: [],
              error: error instanceof Error ? error.message.slice(0, 300) : "Sip generation failed",
              modelVersion: dependencies.model.modelVersion,
              promptVersion: GENERATION_PROMPT_VERSION,
              attempts,
            };
          }
        },
      );
      const failed = results.filter((result) => result.status === "failed").length;
      const status =
        failed === results.length && results.length > 0
          ? "generation_failed"
          : failed
            ? "partial"
            : "review";
      return {
        output: {
          issueId: input.issueId,
          status,
          sips: results,
          completedAt: new Date().toISOString(),
        } satisfies GenerationResult,
      };
    })
    .addEdge(START, "generate_sips")
    .addEdge("generate_sips", END)
    .compile({ checkpointer });
}

export type GenerationGraph = ReturnType<typeof createGenerationGraph>;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  callback: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, limit) }, async () => {
      while (index < items.length) {
        const current = index++;
        output[current] = await callback(items[current]!);
      }
    }),
  );
  return output;
}
