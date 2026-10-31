import type { ResearchSource } from "@spill/shared";
import {
  defaultFetcher,
  readJsonLimited,
  requireSuccessfulResponse,
  type ResearchFetcher,
} from "../http.js";
import type { RawResearchItem, ResearchProvider, ResearchQuery } from "../types.js";

interface HackerNewsItem {
  id?: number;
  type?: string;
  deleted?: boolean;
  dead?: boolean;
  title?: string;
  url?: string;
  text?: string;
  time?: number;
  score?: number;
  descendants?: number;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}

export class HackerNewsResearchProvider implements ResearchProvider {
  readonly type = "hacker_news" as const;
  constructor(private readonly fetcher: ResearchFetcher = defaultFetcher) {}

  async search(_source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]> {
    const listResponse = await this.fetcher(
      "https://hacker-news.firebaseio.com/v0/newstories.json",
      {
        headers: { Accept: "application/json", "User-Agent": "Spill-Research/1.0" },
      },
    );
    requireSuccessfulResponse(listResponse);
    const storyIds = (await readJsonLimited(listResponse)) as number[];
    const scanLimit = Math.min(storyIds.length, Math.max(query.maxResults * 8, 30));
    const cutoff = Date.now() - query.timeRangeDays * 86_400_000;
    const terms = query.query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2);
    const items = await mapLimit(storyIds.slice(0, scanLimit), 6, async (id) => {
      const response = await this.fetcher(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        headers: { Accept: "application/json", "User-Agent": "Spill-Research/1.0" },
      });
      requireSuccessfulResponse(response);
      return (await readJsonLimited(response, 100_000)) as HackerNewsItem | null;
    });
    return items
      .flatMap((item) => {
        if (
          !item?.id ||
          item.type !== "story" ||
          item.deleted ||
          item.dead ||
          !item.title ||
          !item.time
        )
          return [];
        const published = item.time * 1000;
        if (published < cutoff) return [];
        const text = `${item.title} ${item.text ?? ""}`.toLowerCase();
        if (terms.length && !terms.some((term) => text.includes(term))) return [];
        return [
          {
            url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            title: item.title,
            sourceName: "Hacker News",
            publishedAt: new Date(published).toISOString(),
            snippet: [
              item.text,
              item.score !== undefined ? `${item.score} points` : undefined,
              item.descendants !== undefined ? `${item.descendants} comments` : undefined,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ];
      })
      .slice(0, query.maxResults);
  }
}
