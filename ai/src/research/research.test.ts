import assert from "node:assert/strict";
import test from "node:test";
import { cleanSourceText, normalizeReceipt } from "./normalize.js";
import { ResearchService } from "./service.js";
import { TavilyResearchProvider } from "./providers/tavily.js";
import type { ResearchProvider } from "./types.js";

const query = { query: "TypeScript", maxResults: 5, timeRangeDays: 30 };
const source = { type: "web_search" as const, enabled: true };

test("normalizes source content, strips markup and tracking parameters, and marks receipts unverified", () => {
  assert.equal(
    cleanSourceText("<script>ignore this</script><b>Hello &amp; world</b>"),
    "Hello & world",
  );
  assert.equal(cleanSourceText("&#999999999999999999999;"), "&#999999999999999999999;");
  const receipt = normalizeReceipt(
    "web_search",
    {
      url: "https://example.com/story?utm_source=news#top",
      title: "<b>Story</b>",
      sourceName: "Example",
    },
    new Date("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(receipt?.url, "https://example.com/story");
  assert.equal(receipt?.verificationStatus, "unverified");
});

test("research service isolates provider failures, filters stale results and removes duplicate URLs", async () => {
  const providers: ResearchProvider[] = [
    {
      type: "github",
      search: async () => [
        {
          url: "https://example.com/post?utm_campaign=x",
          title: "Recent",
          sourceName: "A",
          publishedAt: new Date().toISOString(),
        },
        {
          url: "https://example.com/old",
          title: "Old",
          sourceName: "A",
          publishedAt: "2000-01-01T00:00:00Z",
        },
      ],
    },
    {
      type: "hacker_news",
      search: async () => [
        { url: "https://example.com/post", title: "Duplicate", sourceName: "B" },
      ],
    },
    {
      type: "rss",
      search: async () => {
        throw new Error("feed failed");
      },
    },
  ];
  const service = new ResearchService({ providers });
  const result = await service.search(
    [
      { type: "github", enabled: true },
      { type: "hacker_news", enabled: true },
      { type: "rss", enabled: true, url: "https://example.com/feed.xml" },
    ],
    query,
  );
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0]?.title, "Recent");
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.code, "provider_error");
});

test("research results respect maxResults and keep case-sensitive paths distinct", async () => {
  const service = new ResearchService({
    providers: [
      {
        type: "github",
        search: async () => [
          { url: "https://example.com/Item", title: "Upper", sourceName: "Example" },
          { url: "https://example.com/item", title: "Lower", sourceName: "Example" },
          { url: "https://example.com/third", title: "Third", sourceName: "Example" },
        ],
      },
    ],
  });
  const result = await service.search([{ type: "github", enabled: true }], {
    ...query,
    maxResults: 2,
  });
  assert.deepEqual(
    result.receipts.map((receipt) => receipt.url),
    ["https://example.com/Item", "https://example.com/item"],
  );
});

test("Tavily provider reports missing credentials without making a network request", async () => {
  let called = false;
  const provider = new TavilyResearchProvider(undefined, async () => {
    called = true;
    throw new Error("unexpected request");
  });
  await assert.rejects(
    provider.search(source, query),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "not_configured",
  );
  assert.equal(called, false);
});
