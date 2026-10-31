import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ResearchSource } from "@spill/shared";
import {
  defaultFetcher,
  readTextLimited,
  requireSuccessfulResponse,
  type ResearchFetcher,
} from "../http.js";
import { cleanSourceText } from "../normalize.js";
import { ResearchProviderError } from "../types.js";
import type { RawResearchItem, ResearchProvider, ResearchQuery } from "../types.js";

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    if (octets.length !== 4) return false;
    if (a === 0 || a === 10 || a === 127 || a! >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b! >= 16 && b! <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.includes("%") || normalized.startsWith("::ffff:")) return false;
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff && !normalized.startsWith("2001:db8:");
  }
  return false;
}

export async function assertSafeFeedUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ResearchProviderError("RSS source URL is invalid");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIP(hostname)
  ) {
    throw new ResearchProviderError("RSS source must use a public HTTP(S) hostname");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ResearchProviderError("RSS source hostname resolves to a non-public address");
  }
  return url;
}

function tagValue(xml: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i").exec(xml);
  return match?.[1]?.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

function linkValue(xml: string): string | undefined {
  const atom = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i.exec(xml)?.[1];
  if (atom) return atom;
  return tagValue(xml, "link");
}

function parseEntries(xml: string, feedName: string): RawResearchItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new ResearchProviderError("RSS feed declarations are not supported");
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
  return entries.flatMap((match) => {
    const item = match[2] ?? "";
    const title = tagValue(item, "title");
    const url = linkValue(item) ?? tagValue(item, "guid");
    const publishedAt =
      tagValue(item, "pubDate") ??
      tagValue(item, "published") ??
      tagValue(item, "updated") ??
      tagValue(item, "dc:date");
    const snippet =
      tagValue(item, "content:encoded") ??
      tagValue(item, "content") ??
      tagValue(item, "description") ??
      "";
    if (!title || !url) return [];
    return [
      {
        url,
        title: cleanSourceText(title, 300),
        sourceName: cleanSourceText(feedName, 160) || "RSS feed",
        ...(publishedAt ? { publishedAt } : {}),
        snippet: cleanSourceText(snippet),
      },
    ];
  });
}

export class RssResearchProvider implements ResearchProvider {
  readonly type = "rss" as const;
  constructor(
    private readonly fetcher: ResearchFetcher = defaultFetcher,
    private readonly checkUrl: (value: string) => Promise<URL> = assertSafeFeedUrl,
  ) {}

  async search(source: ResearchSource, query: ResearchQuery): Promise<RawResearchItem[]> {
    if (!source.url)
      throw new ResearchProviderError("RSS source needs a feed URL", "not_configured");
    const url = await this.checkUrl(source.url);
    const response = await this.fetcher(url, {
      redirect: "error",
      headers: { Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" },
    });
    requireSuccessfulResponse(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/(xml|rss|atom)/.test(contentType)) {
      throw new ResearchProviderError("RSS source did not return XML content");
    }
    const xml = await readTextLimited(response, 1_500_000);
    const feedName = tagValue(xml, "title") ?? url.hostname;
    const cutoff = Date.now() - query.timeRangeDays * 86_400_000;
    return parseEntries(xml, feedName)
      .filter(
        (item) =>
          !item.publishedAt ||
          !Number.isFinite(Date.parse(item.publishedAt)) ||
          Date.parse(item.publishedAt) >= cutoff,
      )
      .slice(0, query.maxResults);
  }
}
