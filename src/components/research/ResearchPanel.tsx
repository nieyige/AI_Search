import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useResearchStore } from "@/core/research/store";
import { cn } from "@/lib/utils";
import { ResearchTabs } from "./ResearchTabs";

interface ResearchPanelProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export function ResearchPanel({ open, onClose, onRetry }: ResearchPanelProps) {
  // Keep the last research mounted while the drawer animates closed so its
  // scroll positions and rendered markdown survive.
  const researchId = useResearchStore(
    (state) => state.openResearchId ?? state.researchIds[state.researchIds.length - 1] ?? null,
  );
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // The `inert` property is not in React 18's typings but keeps focus out of
    // the collapsed panel.
    const shell = shellRef.current as (HTMLElement & { inert: boolean }) | null;
    if (shell) shell.inert = !open;
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px] transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        ref={shellRef}
        role="complementary"
        aria-label="研究过程"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh w-[calc(100vw-16px)] shrink-0 flex-col overflow-hidden rounded-l-2xl bg-white shadow-panel transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
          "md:static md:h-full md:rounded-none md:border-l md:border-line md:shadow-none md:transition-[width] md:duration-300",
          open ? "md:w-[clamp(360px,40vw,960px)]" : "md:w-0 md:border-l-0",
        )}
      >
        <div className="flex h-full w-[calc(100vw-16px)] min-w-0 flex-col md:w-[clamp(360px,40vw,960px)]">
          {researchId ? (
            <ResearchTabs researchId={researchId} onClose={onClose} onRetry={onRetry} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
              <Sparkles className="size-5" />
              研究开始后，活动与报告会显示在这里
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
