import { ExternalLink, FileText } from "lucide-react";
import { pageTitleCache } from "@/core/research/lru";
import type { ToolCall } from "@/core/research/types";
import { cn, hostname, safeHref } from "@/lib/utils";
import { Favicon } from "./Favicon";

interface CrawlActivityProps {
  toolCall: ToolCall;
}

export function CrawlActivity({ toolCall }: CrawlActivityProps) {
  const rawUrl = typeof toolCall.args.url === "string" ? toolCall.args.url : "";
  const href = safeHref(rawUrl);
  const running = toolCall.result === undefined;
  // web_search warms the url -> title cache; fall back to host or raw URL.
  const title =
    (href && pageTitleCache.get(href)) || hostname(href) || rawUrl || "未知页面";
  const excerpt = toolCall.result
    ? toolCall.result.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220)
    : "";

  return (
    <div className="rounded-xl border border-line/70 bg-white/60 p-2.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
          <FileText className="size-3.5" />
        </span>
        <span className={cn("shrink-0 text-muted", running && "shimmer-text")}>
          {running ? "Reading" : "Read"}
        </span>
        <Favicon url={href} className="ml-0.5" />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-w-0 items-center gap-1 font-medium text-ink hover:text-brand-ink"
          >
            <span className="truncate">{title}</span>
            <ExternalLink className="size-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ) : (
          <span className="truncate text-ink">{title}</span>
        )}
      </div>
      {running ? (
        <div className="mt-2 h-2 w-3/4 animate-pulse rounded bg-slate-200/70" />
      ) : (
        excerpt && <p className="mt-1.5 line-clamp-2 pl-8 text-[11.5px] leading-relaxed text-muted">{excerpt}</p>
      )}
    </div>
  );
}
