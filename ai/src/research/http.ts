export type ResearchFetcher = typeof fetch;

export const defaultFetcher: ResearchFetcher = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) });

export async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("Provider response exceeds the size limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Provider response exceeds the size limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readJsonLimited(response: Response, maxBytes = 2_000_000): Promise<unknown> {
  const text = await readTextLimited(response, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Provider returned invalid JSON");
  }
}

export function requireSuccessfulResponse(response: Response): void {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error("Provider authentication failed");
  }
  if (response.status === 429) throw new Error("Provider rate limit reached");
  throw new Error(`Provider request failed with status ${response.status}`);
}
