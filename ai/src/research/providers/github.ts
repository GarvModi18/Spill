import type { ResearchSource } from "@spill/shared";
import {
  defaultFetcher,
  readJsonLimited,
  requireSuccessfulResponse,
  type ResearchFetcher,
} from "../http.js";
import type { RawResearchItem, ResearchProvider, ResearchQuery } from "../types.js";

interface GitHubRepository {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  pushed_at?: string | null;
  stargazers_count?: number;
  language?: string | null;
}

export class GitHubResearchProvider implements ResearchProvider {
  readonly type = "github" as const;
  constructor(
    private readonly token = "",
    private readonly fetcher: ResearchFetcher = defaultFetcher,
  ) {}

  async search(_source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]> {
    const cutoff = new Date(Date.now() - query.timeRangeDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const params = new URLSearchParams({
      q: `${query.query} pushed:>=${cutoff}`,
      sort: "updated",
      order: "desc",
      per_page: String(Math.min(query.maxResults, 20)),
    });
    const response = await this.fetcher(`https://api.github.com/search/repositories?${params}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "Spill-Research/1.0",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    requireSuccessfulResponse(response);
    const body = (await readJsonLimited(response)) as { items?: GitHubRepository[] };
    return (body.items ?? []).flatMap((item) =>
      item.html_url && item.full_name
        ? [
            {
              url: item.html_url,
              title: item.full_name,
              sourceName: "GitHub",
              ...(item.pushed_at ? { publishedAt: item.pushed_at } : {}),
              snippet: [
                item.description,
                item.language,
                item.stargazers_count !== undefined ? `${item.stargazers_count} stars` : undefined,
              ]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : [],
    );
  }
}
