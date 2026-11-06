import { useEffect } from "react";
import { useResearchStore } from "@/core/research/store";
import type { TabKey } from "@/core/research/types";
import { useResearchStream } from "@/hooks/useResearchStream";
import { Chat } from "@/components/Chat";
import { ResearchPanel } from "@/components/research/ResearchPanel";

export default function App() {
  const openResearchId = useResearchStore((state) => state.openResearchId);
  const openPanel = useResearchStore((state) => state.openPanel);
  const closePanel = useResearchStore((state) => state.closePanel);
  const setActiveTab = useResearchStore((state) => state.setActiveTab);
  const stream = useResearchStream();

  const open = Boolean(openResearchId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  const handleOpenResearch = (tab: TabKey) => {
    openPanel();
    setActiveTab(tab);
  };

  return (
    <main className="flex h-dvh w-full overflow-hidden bg-canvas text-ink">
      <Chat
        panelOpen={open}
        onSubmit={stream.start}
        onOpenResearch={handleOpenResearch}
        onRetry={stream.retry}
      />
      <ResearchPanel open={open} onClose={closePanel} onRetry={stream.retry} />
    </main>
  );
}
