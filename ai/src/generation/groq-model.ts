import { ChatGroq } from "@langchain/groq";
import { ResearchReceipt } from "@spill/shared";
import { GENERATION_SYSTEM_PROMPT } from "./prompt.js";
import type { GenerationDraft, GenerationModel } from "./types.js";
import type { GenerationRoom, GenerationSip } from "./types.js";

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content", "claims"],
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim", "supported", "evidenceUrls"],
              properties: {
                claim: { type: "string" },
                supported: { type: "boolean" },
                evidenceUrls: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
} as const;

export class GroqGenerationModel implements GenerationModel {
  private readonly model;
  constructor(apiKey: string, modelName: string) {
    this.modelVersion = modelName;
    this.model = new ChatGroq({ apiKey, model: modelName, temperature: 0.2 }).withStructuredOutput(
      outputSchema,
    );
  }
  readonly modelVersion: string;
  async generate(input: {
    teaRoom: GenerationRoom;
    sip: GenerationSip;
    query: string;
    receipts: ResearchReceipt[];
  }): Promise<GenerationDraft> {
    const prompt = {
      teaRoom: {
        name: input.teaRoom.name,
        description: input.teaRoom.description,
        audience: input.teaRoom.audience,
        editorialVoice: input.teaRoom.editorialVoice,
      },
      sip: {
        title: input.sip.title,
        description: input.sip.description,
        type: input.sip.type,
        itemCount: input.sip.itemCount,
        instructions: input.sip.instructions,
        writingStyle: input.sip.writingStyle,
        contentLength: input.sip.contentLength,
        outputSchema: input.sip.outputSchema,
      },
      researchQuery: input.query,
      receipts: input.receipts.map(({ url, title, sourceName, publishedAt, snippet }) => ({
        url,
        title,
        sourceName,
        publishedAt,
        snippet,
      })),
    };
    return (await this.model.invoke([
      ["system", GENERATION_SYSTEM_PROMPT],
      ["human", JSON.stringify(prompt)],
    ])) as GenerationDraft;
  }
}
