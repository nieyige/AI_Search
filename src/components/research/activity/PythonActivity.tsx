import { TerminalSquare } from "lucide-react";
import type { ToolCall } from "@/core/research/types";
import { cn } from "@/lib/utils";
import { CodeBlock, prettyPayload } from "../CodeBlock";

interface PythonActivityProps {
  toolCall: ToolCall;
}

export function PythonActivity({ toolCall }: PythonActivityProps) {
  const code =
    typeof toolCall.args.code === "string"
      ? toolCall.args.code
      : typeof toolCall.args.source === "string"
        ? toolCall.args.source
        : "";
  const running = toolCall.result === undefined;

  return (
    <div className="rounded-xl border border-line/70 bg-white/60 p-2.5">
      <div className="mb-2 flex items-center gap-2 text-[12.5px]">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700">
          <TerminalSquare className="size-3.5" />
        </span>
        <span className={cn("font-medium", running && "shimmer-text")}>
          {running ? "Running Python code" : "Ran Python code"}
        </span>
      </div>
      {code ? (
        <CodeBlock code={code} language="python" maxHeight={400} />
      ) : (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      )}
      {!running && toolCall.result && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Output</p>
          <CodeBlock code={prettyPayload(toolCall.result)} showHeader={false} maxHeight={240} />
        </div>
      )}
    </div>
  );
}
