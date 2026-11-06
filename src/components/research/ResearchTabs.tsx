import { Activity, FileText, X } from "lucide-react";
import { useResearchStore, selectReportMessage } from "@/core/research/store";
import type { TabKey } from "@/core/research/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ActivitiesList } from "./ActivitiesList";
import { ReportView } from "./ReportView";

interface ResearchTabsProps {
  researchId: string;
  onClose: () => void;
  onRetry: () => void;
}

export function ResearchTabs({ researchId, onClose, onRetry }: ResearchTabsProps) {
  const storedTab = useResearchStore(
    (state) => state.activeTabByResearch[researchId] ?? "activities",
  );
  const hasReport = useResearchStore(
    (state) => Boolean(state.reportIdByResearch[researchId]),
  );
  const report = useResearchStore((state) => selectReportMessage(state, researchId));
  const researching = useResearchStore(
    (state) =>
      state.ongoingResearchId === researchId || Boolean(selectReportMessage(state, researchId)?.isStreaming),
  );
  const setActiveTab = useResearchStore((state) => state.setActiveTab);

  // Never allow the UI to sit on a disabled Report tab.
  const activeTab: TabKey = storedTab === "report" && !hasReport ? "activities" : storedTab;

  const changeTab = (value: string) => {
    if (value === "report" && !hasReport) return;
    setActiveTab(value as TabKey);
  };

  return (
    <Tabs value={activeTab} onValueChange={changeTab} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/80 px-3 py-2">
        <TabsList>
          <TabsTrigger value="activities">
            <Activity className="size-3.5" />
            Activities
            {researching && (
              <span className="ml-0.5 size-1.5 animate-pulse rounded-full bg-brand" />
            )}
          </TabsTrigger>
          <TabsTrigger value="report" disabled={!hasReport}>
            <FileText className="size-3.5" />
            Report
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <span
              className={`size-1.5 rounded-full ${researching ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`}
            />
            {researching ? "进行中" : "已完成"}
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭研究侧栏">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <TabsContent
        value="activities"
        forceMount
        hidden={activeTab !== "activities"}
        className="m-0 min-h-0 flex-1"
      >
        <div className="h-full overflow-y-auto overscroll-contain">
          <ActivitiesList researchId={researchId} onViewReport={() => setActiveTab("report")} />
        </div>
      </TabsContent>

      <TabsContent
        value="report"
        forceMount
        hidden={activeTab !== "report"}
        className="m-0 min-h-0 flex-1"
      >
        <ReportView
          researchId={researchId}
          message={report}
          onRetry={onRetry}
          onViewActivities={() => setActiveTab("activities")}
        />
      </TabsContent>
    </Tabs>
  );
}
