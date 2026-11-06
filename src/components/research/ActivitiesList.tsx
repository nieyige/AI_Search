import { AlertCircle, Code2, FileText, Search, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useResearchStore } from "@/core/research/store";
import type { AgentMessage, ToolCall } from "@/core/research/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "./Markdown";
import { CrawlActivity } from "./activity/CrawlActivity";
import { McpActivity } from "./activity/McpActivity";
import { PythonActivity } from "./activity/PythonActivity";
import { WebSearchActivity } from "./activity/WebSearchActivity";

function ToolCard({ toolCall, error }: { toolCall: ToolCall; error?: string }) {
  switch (toolCall.name) {
    case "web_search":
      return <WebSearchActivity toolCall={toolCall} error={error} />;
    case "crawl_tool":
      return <CrawlActivity toolCall={toolCall} />;
    case "python_repl_tool":
      return <PythonActivity toolCall={toolCall} />;
    default:
      return <McpActivity toolCall={toolCall} />;
  }
}

const AGENT_META = {
  researcher: { label: "Researcher", Icon: Search, className: "bg-brand-soft text-brand-ink" },
  coder: { label: "Coder", Icon: Code2, className: "bg-violet-50 text-violet-700" },
  reporter: { label: "Reporter", Icon: FileText, className: "bg-amber-50 text-amber-700" },
  planner: { label: "Planner", Icon: Sparkles, className: "bg-slate-100 text-slate-600" },
  other: { label: "Tool", Icon: Sparkles, className: "bg-slate-100 text-slate-600" },
} as const;

function ActivityItem({
  message,
  researching,
  onViewReport,
}: {
  message: AgentMessage;
  researching: boolean;
  onViewReport: () => void;
}) {
  const meta = AGENT_META[message.agent];
  const calls = useMemo(() => {
    // Multiple calls on one message are rendered in order, deduplicated by id.
    const seen = new Set<string>();
    return message.toolCalls.filter((call) => {
      if (seen.has(call.id)) return false;
      seen.add(call.id);
      return true;
    });
  }, [message.toolCalls]);

  const isReporter = message.agent === "reporter";
  const showText = !isReporter && Boolean(message.content);
  const showEmpty = !isReporter && !message.content && calls.length === 0;

  return (
    <li className="relative animate-fade-up pl-10">
      <span
        className={cn(
          "absolute left-0 top-0 grid size-[27px] place-items-center rounded-full ring-4 ring-white",
          meta.className,
        )}
      >
        <meta.Icon className="size-3.5" />
      </span>

      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {meta.label}
          </span>
          {message.isStreaming && (
            <span className="shimmer-text text-[11px] font-medium">进行中</span>
          )}
        </div>

        {showEmpty && (
          <div className="w-2/3 space-y-1.5 rounded-lg border border-line/70 bg-white/60 p-3">
            <Skeleton className="h-2.5 w-4/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
        )}

        {showText && <Markdown content={message.content} streaming={message.isStreaming} />}

        {isReporter && message.content && (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3">
            <p className="text-[12.5px] font-medium text-amber-900">
              {message.isStreaming ? "正在撰写报告…" : "报告已生成"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-amber-900/70">
              {message.content.replace(/[#>*`_()[\]{}]/g, " ").replace(/\s+/g, " ").slice(0, 140)}
            </p>
            <Button variant="outline" size="sm" className="mt-2 bg-white" onClick={onViewReport}>
              打开 Report
            </Button>
          </div>
        )}

        {calls.map((call) => (
          <ToolCard
            key={call.id}
            toolCall={call}
            error={message.error && call.name === "web_search" ? message.error : undefined}
          />
        ))}

        {message.error && !isReporter && calls.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {message.error}
          </div>
        )}
      </div>

      {researching && message.isStreaming && (
        <span className="sr-only">该步骤仍在进行中</span>
      )}
    </li>
  );
}

interface ActivitiesListProps {
  researchId: string;
  onViewReport: () => void;
}

export function ActivitiesList({ researchId, onViewReport }: ActivitiesListProps) {
  const messages = useResearchStore((state) => state.messages);
  const activityIds = useResearchStore(
    (state) => state.activityIdsByResearch[researchId],
  );
  const planId = useResearchStore((state) => state.planIdByResearch[researchId]);
  const researching = useResearchStore(
    (state) => state.ongoingResearchId === researchId,
  );

  const activities = useMemo(() => {
    // Index 0 is the planner message (the plan lives in the chat column). If a
    // plan could not be recovered, keep the first activity rather than hiding it.
    const ids = activityIds ?? [];
    return (planId ? ids.slice(1) : ids)
      .map((id) => messages.find((message) => message.id === id))
      .filter((message): message is AgentMessage => Boolean(message));
  }, [activityIds, planId, messages]);

  if (activities.length === 0) {
    return (
      <div className="space-y-4 px-5 py-6">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="flex gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1.5 animate-pulse-dot rounded-full bg-brand"
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ))}
          </span>
          {researching ? <span className="shimmer-text">研究员正在启动…</span> : "暂无活动记录"}
        </div>
        <div className="space-y-2 pl-10">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-10 w-4/5 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-5 py-6">
      <div className="absolute bottom-8 left-[33px] top-8 w-px bg-gradient-to-b from-line via-line to-transparent" />
      <ol className="space-y-5">
        {activities.map((message) => (
          <ActivityItem
            key={message.id}
            message={message}
            researching={researching}
            onViewReport={onViewReport}
          />
        ))}
      </ol>

      {researching && (
        <div className="mt-5 flex items-center gap-2 pl-10 text-[12px] text-muted">
          <span className="flex gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1.5 animate-pulse-dot rounded-full bg-brand"
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ))}
          </span>
          <span className="shimmer-text">研究进行中…</span>
        </div>
      )}
    </div>
  );
}
