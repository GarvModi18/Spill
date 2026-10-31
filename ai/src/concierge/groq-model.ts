import { ChatGroq } from "@langchain/groq";
import {
  conciergeDraftReplySchema,
  conciergeReplySchema,
  type ConciergeReply,
} from "@spill/shared";
import { CONCIERGE_SYSTEM_PROMPT } from "./prompt.js";
import type { ConciergeInput, ConciergeModel } from "./types.js";

export class GroqConciergeModel implements ConciergeModel {
  private readonly model;

  constructor(apiKey: string, modelName: string) {
    this.model = new ChatGroq({ apiKey, model: modelName, temperature: 0 }).withStructuredOutput(
      conciergeDraftReplySchema,
    );
  }

  async respond(input: ConciergeInput): Promise<ConciergeReply> {
    const rooms = input.teaRooms.map((room) => ({
      id: room.id,
      name: room.name,
      slug: room.slug,
      status: room.status,
      description: room.description,
      frequency: room.frequency,
      timezone: room.timezone,
      schedule: room.schedule,
      sips: room.sips,
    }));
    const response = await this.model.invoke([
      ["system", `${CONCIERGE_SYSTEM_PROMPT}\n\nCurrent Tea Rooms:\n${JSON.stringify(rooms)}`],
      ...input.history.slice(-12).map((turn) => [turn.role, turn.content] as [string, string]),
      ["human", input.message],
    ]);
    return conciergeReplySchema.parse(response);
  }
}
