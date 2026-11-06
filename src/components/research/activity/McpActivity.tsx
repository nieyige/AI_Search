import { PlugZap } from "lucide-react";
import type { ToolCall } from "@/core/research/types";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeBlock, prettyPayload } from "../CodeBlock";

interface McpActivityProps {
  toolCall: ToolCall;
}

/** Fallback renderer for MCP and any unknown tools (spec §7). */
export function McpActivity({ toolCall }: McpActivityProps) {
  const running = toolCall.result === undefined;
  const shortName = toolCall.name.replace(/^mcp__/, "").replace(/__/g, " · ");

  return (
    <div className="rounded-xl border border-line/70 bg-white/60 px-2.5 py-1">
      <Accordion type="single" collapsible>
        <AccordionItem value="tool">
          <AccordionTrigger>
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700">
                <PlugZap className="size-3.5" />
              </span>
              <span className={cn("truncate", running && "shimmer-text")}>
                {running ? "Running" : "Ran"} <span className="font-mono">{shortName}()</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pl-8">
            {running ? (
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-2/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            ) : (
              <>
                {Object.keys(toolCall.args).length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Arguments</p>
                    <CodeBlock code={JSON.stringify(toolCall.args, null, 2)} language="json" showHeader={false} maxHeight={200} />
                  </div>
                )}
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Result</p>
                  <CodeBlock code={prettyPayload(toolCall.result)} language="json" showHeader={false} maxHeight={280} />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
