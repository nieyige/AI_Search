import { safeHref } from "@/lib/utils";
import type { AgentMessage } from "./types";

export interface SearchResultItem {
  type: string;
  index?: number;
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  thumbnail?: string;
  favicon?: string;
  date?: string;
}

export interface SourceItem {
  index: number;
  title: string;
  url: string;
  type: string;
}

export function parseSearchResults(raw: string | undefined): SearchResultItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SearchResultItem[]) : null;
  } catch {
    return null;
  }
}

/**
 * Report citations use the search-result index assigned by the server.
 * Results arrive through tool cards, so we rebuild the index -> source map
 * from the activity messages themselves.
 */
export function collectSources(messages: AgentMessage[]): Map<number, SourceItem> {
  const sources = new Map<number, SourceItem>();
  for (const message of messages) {
    for (const toolCall of message.toolCalls) {
      const items = parseSearchResults(toolCall.result);
      if (!items) continue;
      for (const item of items) {
        if (typeof item.index !== "number") continue;
        const url = safeHref(item.url ?? item.link);
        if (!url) continue;
        if (!sources.has(item.index)) {
          sources.set(item.index, {
            index: item.index,
            title: item.title?.trim() || url,
            url,
            type: item.type ?? "page",
          });
        }
      }
    }
  }
  return sources;
}

function markdownTitle(title: string): string {
  return title.replace(/["\\\n\r]/g, " ").trim();
}

/**
 * Rewrite `[n]` citation markers into markdown links. Fenced code blocks are
 * left untouched so sampled code that happens to contain [1] is not rewritten.
 */
export function linkifyCitations(markdown: string, sources: Map<number, SourceItem>): string {
  if (sources.size === 0) return markdown;
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/\[(\d+)\](?!\()/g, (match, raw: string) => {
        const source = sources.get(Number(raw));
        if (!source) return match;
        return `[\\[${raw}\\]](${source.url} "${markdownTitle(source.title)}")`;
      });
    })
    .join("");
}
