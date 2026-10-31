import { researchReceiptSchema } from "@spill/shared";
import type { ResearchReceipt, ResearchSourceType } from "@spill/shared";
import type { RawResearchItem } from "./types.js";

const entityMap: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code.toLowerCase().startsWith("#x")) {
      const point = Number.parseInt(code.slice(2), 16);
      return Number.isInteger(point) &&
        point >= 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : entity;
    }
    if (code.startsWith("#")) {
      const point = Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) &&
        point >= 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : entity;
    }
    return entityMap[code.toLowerCase()] ?? entity;
  });
}

export function cleanSourceText(value: string, maxLength = 4000): string {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, maxLength);
}

export function canonicalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeReceipt(
  sourceType: ResearchSourceType,
  item: RawResearchItem,
  retrievedAt = new Date(),
): ResearchReceipt | null {
  const url = canonicalizeUrl(item.url);
  const title = cleanSourceText(item.title, 300);
  const sourceName = cleanSourceText(item.sourceName, 160);
  if (!url || !title || !sourceName) return null;
  const publishedDate = item.publishedAt ? new Date(item.publishedAt) : null;
  const publishedAt =
    publishedDate && Number.isFinite(publishedDate.getTime())
      ? publishedDate.toISOString()
      : undefined;
  const result = researchReceiptSchema.safeParse({
    url,
    title,
    sourceName,
    ...(publishedAt ? { publishedAt } : {}),
    retrievedAt: retrievedAt.toISOString(),
    snippet: cleanSourceText(item.snippet ?? ""),
    sourceType,
    verificationStatus: "unverified",
  });
  return result.success ? result.data : null;
}

export function deduplicateReceipts(receipts: ResearchReceipt[]): ResearchReceipt[] {
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    const key = receipt.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
