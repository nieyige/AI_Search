const ENDPOINT = "https://metaso.cn/api/v1/search";

/** Call the Metaso search API for one keyword string. Returns a normalized result list. */
export async function metasoSearch(q, signal) {
  const key = process.env.METASO_API_KEY;
  if (!key) throw new Error("METASO_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q,
      scope: "webpage",
      includeSummary: false,
      size: "10",
      includeRawContent: false,
      conciseSnippet: false,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)].filter(Boolean)),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Metaso HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.webpages ?? []).map((w) => ({
    title: w.title ?? "",
    link: w.link ?? "",
    snippet: w.snippet ?? "",
    date: w.date ?? "",
    authors: w.authors ?? [],
    score: w.score ?? "",
  }));
}
