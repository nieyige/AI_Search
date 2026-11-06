import { ExternalLink, ImageIcon, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { pageTitleCache } from "@/core/research/lru";
import { parseSearchResults, type SearchResultItem } from "@/core/research/sources";
import type { ToolCall } from "@/core/research/types";
import { cn, hostname, safeHref } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Favicon } from "./Favicon";

function ResultSkeletons() {
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex gap-2 rounded-lg border border-line/80 bg-white p-2.5"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <Skeleton className="size-5 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-4/5" />
            <Skeleton className="h-2 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PageCard({ item, index }: { item: SearchResultItem; index: number }) {
  const href = safeHref(item.url ?? item.link);
  if (!href) return null;
  const title = item.title?.trim() || hostname(href) || href;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex w-full min-w-0 grow basis-full items-start gap-2 rounded-lg border border-line/80 bg-white p-2.5 animate-fade-up transition-colors hover:border-brand/30 hover:bg-brand-soft/40 sm:basis-[calc(50%-0.25rem)]"
      style={{ animationDelay: `${Math.min(index, 8) * 100}ms` }}
    >
      <Favicon url={href} favicon={item.favicon} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink transition-colors group-hover:text-brand-ink">
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
          <span className="truncate">{hostname(href)}</span>
          <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </span>
    </a>
  );
}

function ImageCard({ item, index }: { item: SearchResultItem; index: number }) {
  const [failed, setFailed] = useState(false);
  const href = safeHref(item.url ?? item.link);
  const image = safeHref(item.thumbnail) ?? href;
  if (!image) return null;
  return (
    <a
      href={href ?? image}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative w-[104px] shrink-0 overflow-hidden rounded-lg border border-line/80 bg-slate-100 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 100}ms` }}
    >
      {failed ? (
        <span className="grid h-[72px] w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
          <ImageIcon className="size-5" />
        </span>
      ) : (
        <img
          src={image}
          alt={item.title ?? ""}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-[72px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      )}
      <span className="line-clamp-1 px-1.5 py-1 text-[10.5px] text-muted">{item.title}</span>
    </a>
  );
}

interface WebSearchActivityProps {
  toolCall: ToolCall;
  error?: string;
}

export function WebSearchActivity({ toolCall, error }: WebSearchActivityProps) {
  const query = typeof toolCall.args.query === "string" ? toolCall.args.query : "";
  const running = toolCall.result === undefined && !error;
  const items = useMemo(() => parseSearchResults(toolCall.result), [toolCall.result]);

  // Warm the title cache as soon as results arrive so crawl cards can resolve
  // a friendly page title instead of showing a raw URL.
  if (items) {
    for (const item of items) {
      const url = safeHref(item.url ?? item.link);
      if (url && item.title) pageTitleCache.set(url, item.title);
    }
  }

  const pages = (items ?? []).filter((item) => (item.type ?? "page") === "page");
  const images = (items ?? []).filter((item) => item.type === "image");

  return (
    <div className="rounded-xl border border-line/70 bg-white/60 p-2.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink">
          <Search className="size-3.5" />
        </span>
        <span className={cn("truncate font-medium", running && "shimmer-text")}>
          {running ? (
            <>
              Searching for <span className="text-brand-ink">“{query || "..."}”</span>
            </>
          ) : (
            <>
              Searched <span className="text-ink">“{query || "web"}”</span>
              {items && <span className="ml-1 text-muted">· {items.length} 条</span>}
            </>
          )}
        </span>
      </div>

      {running && <ResultSkeletons />}

      {!running && error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          搜索失败：{error}
        </div>
      )}

      {!running && !error && items && items.length === 0 && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-muted">
          <SearchX className="size-4" />
          未找到结果
        </div>
      )}

      {!running && !error && pages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pages.map((item, index) => (
            <PageCard key={`${item.url ?? item.link}-${index}`} item={item} index={index} />
          ))}
        </div>
      )}

      {!running && !error && images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((item, index) => (
            <ImageCard key={`${item.thumbnail ?? item.url}-${index}`} item={item} index={index} />
          ))}
        </div>
      )}

      {!running && !error && !items && toolCall.result && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11.5px] text-muted">
          <ImageIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-3 break-all">{toolCall.result}</span>
        </div>
      )}

      {toolCall.argsError && (
        <p className="mt-1.5 text-[11px] text-amber-600">{toolCall.argsError}</p>
      )}
    </div>
  );
}
