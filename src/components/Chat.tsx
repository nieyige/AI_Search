import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Compass,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useResearchStore, selectReportMessage } from "@/core/research/store";
import type { AgentMessage, TabKey } from "@/core/research/types";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/research/Markdown";

interface ChatProps {
  panelOpen: boolean;
  onSubmit: (query: string) => void;
  onOpenResearch: (tab: TabKey) => void;
  onRetry: () => void;
}

const SUGGESTIONS = [
  "2026 年 AI Agent 产品有哪些关键进展？",
  "对比一下主流向量数据库的适用场景",
  "帮我调研 React Server Components 的现状与争议",
];

function DotLoader() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-pulse-dot rounded-full bg-brand"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}

function AgentStatus({
  researchId,
  message,
  researchDone,
  planning,
  failed,
  onOpenResearch,
  onRetry,
}: {
  researchId: string | null;
  message: AgentMessage | undefined;
  researchDone: boolean;
  planning: boolean;
  failed: boolean;
  onOpenResearch: (tab: TabKey) => void;
  onRetry: () => void;
}) {
  if (!researchId) return null;
  const streamingReport = Boolean(message?.isStreaming);
  const hasReport = Boolean(message);
  const interrupted =
    message?.finishReason === "error" ||
    message?.finishReason === "interrupted" ||
    message?.finishReason === "aborted" ||
    Boolean(message?.error);

  if (planning && !researchDone) {
    return (
      <StatusCard
        icon={<DotLoader />}
        title="正在制定研究计划"
        detail="Agent 正在拆解问题、生成检索关键词。"
        action="查看研究过程"
        onClick={() => onOpenResearch("activities")}
      />
    );
  }

  if (!researchDone && streamingReport) {
    return (
      <StatusCard
        icon={<DotLoader />}
        title="正在撰写报告"
        detail="报告会实时出现在右侧 Report 标签。"
        action="查看报告"
        onClick={() => onOpenResearch("report")}
      />
    );
  }

  if (!researchDone) {
    return (
      <StatusCard
        icon={<DotLoader />}
        title="Agent 正在研究"
        detail="检索、阅读与分析过程会实时显示在右侧 Activities。"
        action="查看研究过程"
        onClick={() => onOpenResearch("activities")}
      />
    );
  }

  if (interrupted) {
    return (
      <StatusCard
        icon={<AlertTriangle className="size-4 text-amber-600" />}
        title={hasReport ? "报告生成中断" : "研究未完成"}
        detail={message?.error || "已保留收到的内容，可以重试本次研究。"}
        action={hasReport ? "查看报告" : "重试"}
        onClick={() => (hasReport ? onOpenResearch("report") : onRetry())}
      />
    );
  }

  if (failed) {
    return (
      <StatusCard
        icon={<AlertTriangle className="size-4 text-amber-600" />}
        title="研究未完成"
        detail="连接已断开或服务出错，已保留已收到内容。"
        action="重试"
        onClick={onRetry}
      />
    );
  }

  return (
    <StatusCard
      icon={<Sparkles className="size-4 text-emerald-600" />}
      title="研究完成"
      detail={hasReport ? "报告已生成，可查看、复制、下载或继续编辑。" : "研究过程已记录。"}
      action={hasReport ? "查看报告" : "查看研究过程"}
      onClick={() => onOpenResearch(hasReport ? "report" : "activities")}
    />
  );
}

function StatusCard({
  icon,
  title,
  detail,
  action,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line/80 bg-white/80 p-3.5 shadow-card backdrop-blur">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-canvas">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{detail}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onClick} className="shrink-0">
        {action}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}

export function Chat({ panelOpen, onSubmit, onOpenResearch, onRetry }: ChatProps) {
  const messages = useResearchStore((state) => state.messages);
  const researchIds = useResearchStore((state) => state.researchIds);
  const ongoingResearchId = useResearchStore((state) => state.ongoingResearchId);
  const lastError = useResearchStore((state) => state.lastError);
  const lastQuery = useResearchStore((state) => state.lastQuery);
  const clearError = useResearchStore((state) => state.clearError);

  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const conversation = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === "user" || (message.agent === "planner" && message.content),
      ),
    [messages],
  );

  const currentResearchId = ongoingResearchId ?? researchIds[researchIds.length - 1] ?? null;
  const report = useResearchStore((state) =>
    selectReportMessage(state, currentResearchId),
  );
  const researchDone = Boolean(currentResearchId) && !ongoingResearchId;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [conversation, lastError, ongoingResearchId, report?.isStreaming]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const query = value.trim();
    if (!query) return;
    onSubmit(query);
    setValue("");
  };

  const empty = conversation.length === 0;
  const lastMessage = messages[messages.length - 1];
  const planning =
    !ongoingResearchId &&
    (lastMessage?.role === "user" ||
      (lastMessage?.agent === "planner" && lastMessage.isStreaming));

  return (
    <div className="relative flex h-dvh min-h-0 flex-1 flex-col bg-canvas md:min-w-[420px]">
      <header className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-line/70 bg-canvas/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-indigo-500 text-white shadow-sm">
            <Compass className="size-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight text-ink">AI 搜索</h1>
            <p className="text-[11px] text-muted">Deep research workspace</p>
          </div>
        </div>

        {researchIds.length > 0 && !panelOpen && (
          <Button variant="outline" size="sm" onClick={() => onOpenResearch("activities")}>
            <PanelRightOpen className="size-3.5" />
            研究过程
          </Button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 md:px-8">
          {empty ? (
            <div className="m-auto w-full max-w-xl py-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-brand shadow-card ring-1 ring-line/70">
                <Sparkles className="size-6" />
              </span>
              <h2 className="mt-5 text-balance text-2xl font-semibold tracking-tight text-ink">
                让 Agent 替你完成一次深度研究
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
                提出一个问题，Agent 会拆解关键词、检索阅读、判断信息是否充分，并在右侧实时展示研究过程与流式报告。
              </p>
              <div className="mt-6 grid gap-2 text-left">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSubmit(suggestion)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-line/80 bg-white/70 px-4 py-3 text-[13px] text-ink transition-all hover:-translate-y-px hover:border-brand/30 hover:bg-white hover:shadow-card"
                  >
                    <span>{suggestion}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {conversation.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-sm">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
                      <Sparkles className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line/70 bg-white px-4 py-3 shadow-sm">
                      <Markdown
                        content={message.content}
                        streaming={message.isStreaming}
                      />
                    </div>
                  </div>
                ),
              )}

              {lastError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">请求失败</p>
                    <p className="mt-0.5 text-red-700/80">{lastError}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {lastQuery && (
                      <Button variant="outline" size="sm" className="bg-white" onClick={onRetry}>
                        <RefreshCw className="size-3" />
                        重试
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={clearError}>
                      关闭
                    </Button>
                  </div>
                </div>
              )}

              <AgentStatus
                researchId={currentResearchId}
                message={report}
                researchDone={researchDone}
                planning={planning}
                failed={Boolean(lastError) && !report}
                onOpenResearch={onOpenResearch}
                onRetry={onRetry}
              />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-canvas via-canvas to-transparent px-4 pb-4 pt-3 md:px-8">
        <form
          onSubmit={submit}
          className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-card transition-shadow focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10"
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={500}
            placeholder={empty ? "输入想研究的问题…" : "继续追问或开始新的研究…"}
            autoComplete="off"
            className="h-9 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-slate-400"
          />
          <Button type="submit" size="icon" className="size-9 rounded-xl" aria-label="开始研究">
            <ArrowUp className="size-4" />
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10.5px] text-slate-400">
          搜索结果为外部数据，Agent 会标注来源编号；重要结论请自行核对。
        </p>
      </div>
    </div>
  );
}
