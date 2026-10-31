import type { ResearchSource } from "@spill/shared";
import {
  defaultFetcher,
  readJsonLimited,
  requireSuccessfulResponse,
  type ResearchFetcher,
} from "../http.js";
import type { RawResearchItem, ResearchProvider, ResearchQuery } from "../types.js";

interface HubModel {
  id?: string;
  modelId?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipeline_tag?: string;
  cardData?: { summary?: string; description?: string; license?: string };
}

export class HuggingFaceResearchProvider implements ResearchProvider {
  readonly type = "hugging_face" as const;
  constructor(private readonly fetcher: ResearchFetcher = defaultFetcher) {}

  async search(_source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]> {
    const params = new URLSearchParams({
      search: query.query,
      limit: String(Math.min(query.maxResults, 20)),
      sort: "downloads",
      direction: "-1",
      full: "true",
    });
    const response = await this.fetcher(`https://huggingface.co/api/models?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "Spill-Research/1.0" },
    });
    requireSuccessfulResponse(response);
    const body = (await readJsonLimited(response)) as HubModel[];
    const cutoff = Date.now() - query.timeRangeDays * 86_400_000;
    return body.flatMap((model) => {
      const id = model.modelId ?? model.id;
      if (!id) return [];
      if (model.lastModified && Date.parse(model.lastModified) < cutoff) return [];
      return [
        {
          url: `https://huggingface.co/${encodeURIComponent(id).replaceAll("%2F", "/")}`,
          title: id,
          sourceName: "Hugging Face Hub",
          ...(model.lastModified ? { publishedAt: model.lastModified } : {}),
          snippet: [
            model.cardData?.summary ?? model.cardData?.description,
            model.pipeline_tag ? `Task: ${model.pipeline_tag}` : undefined,
            model.downloads !== undefined ? `${model.downloads} downloads` : undefined,
            model.likes !== undefined ? `${model.likes} likes` : undefined,
            model.cardData?.license ? `License: ${model.cardData.license}` : undefined,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ];
    });
  }
}
