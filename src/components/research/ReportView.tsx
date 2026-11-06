import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  Check,
  Copy,
  Download,
  Pencil,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useResearchStore } from "@/core/research/store";
import { collectSources, linkifyCitations } from "@/core/research/sources";
import type { AgentMessage } from "@/core/research/types";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";
import { useScrollFollow } from "./ScrollFollow";

interface ReportViewProps {
  researchId: string;
  message: AgentMessage | undefined;
  onRetry: () => void;
  onViewActivities: () => void;
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="mt-5 flex items-center gap-2 text-[12.5px] text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-pulse-dot rounded-full bg-brand"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      <span className="shimmer-text">{label}</span>
    </div>
  );
}

export function ReportView({ researchId, message, onRetry, onViewActivities }: ReportViewProps) {
  const messages = useResearchStore((state) => state.messages);
  const activityIds = useResearchStore(
    (state) => state.activityIdsByResearch[researchId],
  );
  const updateReportContent = useResearchStore((state) => state.updateReportContent);

  const sources = useMemo(() => {
    const ids = activityIds ?? [];
    const activityMessages = ids
      .map((id) => messages.find((item) => item.id === id))
      .filter((item): item is AgentMessage => Boolean(item));
    return collectSources(activityMessages);
  }, [activityIds, messages]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const content = message?.content ?? "";
  // Re-parse markdown at most every 50ms while tokens stream in.
  const rendered = useThrottledValue(content, 50, !message?.isStreaming);
  const display = useMemo(
    () => linkifyCitations(rendered, sources),
    [rendered, sources],
  );

  const streaming = Boolean(message?.isStreaming);
  const { ref, paused, onScroll, scrollToBottom } = useScrollFollow(streaming, [display]);
  const interrupted =
    message?.finishReason === "error" ||
    message?.finishReason === "interrupted" ||
    message?.finishReason === "aborted" ||
    Boolean(message?.error);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard API needs a secure context/permission; fall back to the
      // legacy selection-based copy so the action still works over http.
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "research-report.md";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const startEditing = () => {
    setDraft(content);
    setEditing(true);
  };

  const save = () => {
    updateReportContent(researchId, draft);
    setEditing(false);
  };

  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-muted">
          <BookOpen className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">报告尚未开始</p>
          <p className="mt-1 text-[12.5px] text-muted">
            研究员完成资料收集后，会在这里流式撰写报告。
          </p>
        </div>
        <Button variant="soft" size="sm" onClick={onViewActivities}>
          查看研究过程
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {!streaming && content && !editing && (
        <div className="flex items-center justify-between gap-2 border-b border-line/70 px-5 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Report
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "已复制" : "复制"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="size-3.5" />
              下载
            </Button>
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Pencil className="size-3.5" />
              编辑
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-amber-50/40 px-5 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Editing report
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="size-3.5" />
              取消
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="size-3.5" />
              保存
            </Button>
          </div>
        </div>
      )}

      <div
        ref={ref}
        onScroll={onScroll}
        data-testid="report-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      >
        <div className="mx-auto max-w-[72ch]">
          {interrupted && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {message.error
                    ? "报告生成失败"
                    : message.finishReason === "aborted"
                      ? "研究已中止"
                      : "报告生成中断"}
                </p>
                <p className="mt-0.5 text-amber-800/80">
                  {message.error || "已收到的内容会保留，你可以重试本次研究。"}
                </p>
                <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 bg-white">
                  <RefreshCw className="size-3.5" />
                  重试
                </Button>
              </div>
            </div>
          )}

          {editing ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="min-h-[60vh] w-full resize-y rounded-xl border border-line bg-white p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            />
          ) : content ? (
            <Markdown content={display} streaming={streaming} />
          ) : streaming ? (
            <p className="shimmer-text text-sm text-muted">研究员正在组织报告结构…</p>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              报告内容为空
            </div>
          )}

          {streaming && <LoadingLine label="正在撰写报告…" />}
        </div>
      </div>

      {paused && streaming && (
        <Button
          size="sm"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
        >
          <ArrowDown className="size-3.5" />
          回到最新
        </Button>
      )}
    </div>
  );
}
