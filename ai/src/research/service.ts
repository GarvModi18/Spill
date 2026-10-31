import type { ResearchReceipt, ResearchSource, ResearchSourceType } from "@spill/shared";
import { canonicalizeUrl, deduplicateReceipts, normalizeReceipt } from "./normalize.js";
import { GitHubResearchProvider } from "./providers/github.js";
import { HackerNewsResearchProvider } from "./providers/hacker-news.js";
import { HuggingFaceResearchProvider } from "./providers/hugging-face.js";
import { RssResearchProvider } from "./providers/rss.js";
import { TavilyResearchProvider } from "./providers/tavily.js";
import type { ResearchFetcher } from "./http.js";
import type {
  ResearchFailure,
  ResearchProvider,
  ResearchQuery,
  ResearchSearchResult,
} from "./types.js";

export interface ResearchServiceConfig {
  githubToken?: string;
  tavilyApiKey?: string;
  fetcher?: ResearchFetcher;
  providers?: ResearchProvider[];
}

export class ResearchService {
  private readonly providers: Map<ResearchSourceType, ResearchProvider>;

  constructor(config: ResearchServiceConfig = {}) {
    const fetcher = config.fetcher;
    const providers = config.providers ?? [
      new GitHubResearchProvider(config.githubToken, fetcher),
      new HackerNewsResearchProvider(fetcher),
      new HuggingFaceResearchProvider(fetcher),
      new RssResearchProvider(fetcher),
      new TavilyResearchProvider(config.tavilyApiKey, fetcher),
    ];
    this.providers = new Map(providers.map((provider) => [provider.type, provider]));
  }

  async search(sources: ResearchSource[], query: ResearchQuery): Promise<ResearchSearchResult> {
    const enabled = sources.filter((source) => source.enabled).slice(0, 10);
    const retrievedAt = new Date();
    const settled = await mapLimit(enabled, 5, async (source) => {
      const provider = this.providers.get(source.type);
      if (!provider) {
        throw Object.assign(new Error(`No provider is available for ${source.type}`), {
          code: "not_configured",
        });
      }
      return provider.search(source, query);
    });

    const failures: ResearchFailure[] = [];
    const receipts: ResearchReceipt[] = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index]!;
      const source = enabled[index]!;
      if (result.status === "rejected") {
        const error: unknown = result.reason;
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "not_configured"
            ? "not_configured"
            : "provider_error";
        failures.push({
          sourceType: source.type,
          ...(source.url ? { sourceUrl: source.url } : {}),
          code,
          message: error instanceof Error ? error.message.slice(0, 300) : "Provider request failed",
        });
        continue;
      }
      const cutoff = retrievedAt.getTime() - query.timeRangeDays * 86_400_000;
      for (const item of result.value) {
        if (
          item.publishedAt &&
          Number.isFinite(Date.parse(item.publishedAt)) &&
          Date.parse(item.publishedAt) < cutoff
        ) {
          continue;
        }
        const receipt = normalizeReceipt(source.type, item, retrievedAt);
        if (receipt) receipts.push(receipt);
      }
    }

    const unique = deduplicateReceipts(receipts);
    const resultByUrl = new Map<string, ResearchReceipt>();
    for (const receipt of unique.slice(0, query.maxResults)) {
      const key = canonicalizeUrl(receipt.url);
      if (key) resultByUrl.set(key, receipt);
    }
    return {
      receipts: [...resultByUrl.values()],
      failures,
      retrievedAt: retrievedAt.toISOString(),
    };
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          results[index] = { status: "fulfilled", value: await run(items[index]!) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}
