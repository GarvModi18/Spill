import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { conciergeProposalSchema } from "@spill/shared";
import { z } from "zod";
import type { ConciergeInput, ConciergeModel } from "./types.js";

const ConciergeGraphState = new StateSchema({
  input: z.custom<ConciergeInput>(),
  draft: z.object({ reply: z.unknown(), error: z.string().optional() }).optional(),
  result: z
    .object({
      assistantMessage: z.string(),
      proposal: conciergeProposalSchema.optional(),
    })
    .optional(),
});

export function createConciergeGraph(model: ConciergeModel, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(ConciergeGraphState)
    .addNode("propose", async (state) => ({ draft: { reply: await model.respond(state.input) } }))
    .addNode("validate", (state) => {
      const parsed = z
        .object({
          intent: z.enum(["configuration", "question", "unsupported"]),
          assistantMessage: z.string().min(1).max(2000),
          proposal: z.unknown().optional(),
        })
        .safeParse(state.draft?.reply);
      if (!parsed.success) {
        return {
          result: {
            assistantMessage:
              "I couldn’t prepare a safe configuration preview from that request. Please clarify what you’d like to change.",
          },
        };
      }
      if (parsed.data.proposal === undefined) {
        return { result: { assistantMessage: parsed.data.assistantMessage } };
      }
      const proposal = conciergeProposalSchema.safeParse(parsed.data.proposal);
      if (!proposal.success || parsed.data.intent !== "configuration") {
        return {
          result: {
            assistantMessage:
              "I couldn’t validate that configuration. Please clarify the Tea Room or Sip details and try again.",
          },
        };
      }
      return {
        result: { assistantMessage: parsed.data.assistantMessage, proposal: proposal.data },
      };
    })
    .addEdge(START, "propose")
    .addEdge("propose", "validate")
    .addEdge("validate", END)
    .compile({ checkpointer });
}

export type ConciergeGraph = ReturnType<typeof createConciergeGraph>;
