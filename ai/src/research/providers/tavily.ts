import type { ResearchSource } from "@spill/shared";
import {
  defaultFetcher,
  readJsonLimited,
  requireSuccessfulResponse,
  type ResearchFetcher,
} from "../http.js";
import type { RawResearchItem, ResearchProvider, ResearchQuery } from "../types.js";

interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
  published_date?: string | null;
}

export class TavilyResearchProvider implements ResearchProvider {
  readonly type = "web_search" as const;
  constructor(
    private readonly apiKey = "",
    private readonly fetcher: ResearchFetcher = defaultFetcher,
  ) {}

  async search(_source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]> {
    if (!this.apiKey)
      throw Object.assign(new Error("Web search is not configured"), { code: "not_configured" });
    const response = await this.fetcher("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: `${query.query} (published in the last ${query.timeRangeDays} days)`,
        topic: "general",
        search_depth: "basic",
        max_results: Math.min(query.maxResults, 20),
        include_answer: false,
        include_raw_content: false,
      }),
    });
    requireSuccessfulResponse(response);
    const body = (await readJsonLimited(response)) as { results?: TavilyResult[] };
    return (body.results ?? []).flatMap((item) =>
      item.url && item.title
        ? [
            {
              url: item.url,
              title: item.title,
              sourceName: new URL(item.url).hostname.replace(/^www\./, ""),
              ...(item.published_date ? { publishedAt: item.published_date } : {}),
              snippet: item.content ?? "",
            },
          ]
        : [],
    );
  }
}
