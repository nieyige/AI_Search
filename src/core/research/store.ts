import { create } from "zustand";
import { reduceEvent, type ResearchData } from "./events";
import { uid } from "@/lib/utils";
import type { PersistedResearchState, ResearchEvent, TabKey } from "./types";

export interface ResearchStore extends ResearchData {
  hydrated: boolean;
  processEvent: (event: ResearchEvent) => void;
  hydrate: (persisted: PersistedResearchState | null) => void;
  beginQuery: (query: string) => void;
  openPanel: (researchId?: string) => void;
  closePanel: () => void;
  setActiveTab: (tab: TabKey) => void;
  updateReportContent: (researchId: string, content: string) => void;
  markInterrupted: (message?: string) => void;
  restartRun: () => void;
  clearError: () => void;
}

function freshThreadId(): string {
  try {
    const stored = window.localStorage.getItem("ai-search:thread-id");
    if (stored) return stored;
    const id = uid("thread");
    window.localStorage.setItem("ai-search:thread-id", id);
    return id;
  } catch {
    return uid("thread");
  }
}

const INITIAL: ResearchData = {
  threadId: freshThreadId(),
  messages: [],
  researchIds: [],
  planIdByResearch: {},
  reportIdByResearch: {},
  activityIdsByResearch: {},
  ongoingResearchId: null,
  openResearchId: null,
  activeTabByResearch: {},
  interruptByResearch: {},
  lastSeq: 0,
  activeRunId: null,
  lastQuery: "",
  lastError: null,
};

export const useResearchStore = create<ResearchStore>()((set, get) => ({
  ...INITIAL,
  hydrated: false,

  processEvent: (event) => {
    set((state) => reduceEvent(state, event));
  },

  hydrate: (persisted) => {
    if (!persisted || persisted.version !== 1) {
      set({ hydrated: true });
      return;
    }
    set({
      threadId: persisted.threadId || get().threadId,
      messages: persisted.messages ?? [],
      researchIds: persisted.researchIds ?? [],
      planIdByResearch: persisted.planIdByResearch ?? {},
      reportIdByResearch: persisted.reportIdByResearch ?? {},
      activityIdsByResearch: persisted.activityIdsByResearch ?? {},
      ongoingResearchId: persisted.ongoingResearchId ?? null,
      openResearchId: persisted.openResearchId ?? null,
      activeTabByResearch: persisted.activeTabByResearch ?? {},
      interruptByResearch: persisted.interruptByResearch ?? {},
      lastSeq: persisted.lastSeq ?? 0,
      activeRunId: persisted.activeRunId ?? null,
      lastQuery: persisted.lastQuery ?? "",
      lastError: null,
      hydrated: true,
    });
  },

  beginQuery: (query) => {
    const userMessage = {
      id: uid("user"),
      agent: "other" as const,
      role: "user" as const,
      content: query,
      isStreaming: false,
      toolCalls: [],
      createdAt: Date.now(),
    };
    set((state) => ({
      // A new question abandons the previous run. Keep its partial output
      // visible but never leave a spinner attached to it.
      messages: [
        ...state.messages.map((message) =>
          message.isStreaming
            ? { ...message, isStreaming: false, finishReason: "aborted" }
            : message,
        ),
        userMessage,
      ],
      ongoingResearchId: null,
      activeRunId: null,
      lastSeq: 0,
      lastQuery: query,
      lastError: null,
    }));
  },

  openPanel: (researchId) => {
    const state = get();
    const target =
      researchId ??
      state.ongoingResearchId ??
      state.researchIds[state.researchIds.length - 1] ??
      null;
    if (target) set({ openResearchId: target });
  },

  closePanel: () => set({ openResearchId: null }),

  setActiveTab: (tab) => {
    const state = get();
    const researchId = state.openResearchId;
    if (!researchId) return;
    if (tab === "report" && !state.reportIdByResearch[researchId]) return;
    set({
      activeTabByResearch: {
        ...state.activeTabByResearch,
        [researchId]: tab,
      },
    });
  },

  updateReportContent: (researchId, content) => {
    const state = get();
    const reportId = state.reportIdByResearch[researchId];
    if (!reportId) return;
    set({
      messages: state.messages.map((message) =>
        message.id === reportId ? { ...message, content } : message,
      ),
    });
  },

  markInterrupted: (message) => {
    set((state) => ({
      messages: state.messages.map((item) =>
        item.isStreaming
          ? { ...item, isStreaming: false, finishReason: "interrupted" }
          : item,
      ),
      ongoingResearchId: null,
      lastError: message ?? state.lastError,
    }));
  },

  restartRun: () => {
    set((state) => ({
      messages: state.messages.map((item) =>
        item.isStreaming
          ? { ...item, isStreaming: false, finishReason: "interrupted" }
          : item,
      ),
      ongoingResearchId: null,
      activeRunId: null,
      lastSeq: 0,
      lastError: null,
    }));
  },

  clearError: () => set({ lastError: null }),
}));

/** Derived selectors used by the layout and panel. */
export function selectOpenResearchId(state: ResearchData): string | null {
  return state.openResearchId;
}

export function selectActiveTab(state: ResearchData): TabKey {
  const researchId = state.openResearchId;
  if (!researchId) return "activities";
  return state.activeTabByResearch[researchId] ?? "activities";
}

export function selectHasReport(state: ResearchData, researchId: string | null): boolean {
  return Boolean(researchId && state.reportIdByResearch[researchId]);
}

export function selectReportMessage(state: ResearchData, researchId: string | null) {
  if (!researchId) return undefined;
  const reportId = state.reportIdByResearch[researchId];
  return reportId ? state.messages.find((message) => message.id === reportId) : undefined;
}

export function selectActivities(state: ResearchData, researchId: string | null) {
  if (!researchId) return [];
  const ids = state.activityIdsByResearch[researchId] ?? [];
  // Index 0 is the plan message: the plan lives in the chat, not the timeline.
  return ids
    .slice(1)
    .map((id) => state.messages.find((message) => message.id === id))
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
}

export function selectIsResearching(state: ResearchData, researchId: string | null): boolean {
  if (!researchId) return false;
  const report = selectReportMessage(state, researchId);
  if (state.ongoingResearchId === researchId) return true;
  if (report) return report.isStreaming;
  return selectActivities(state, researchId).some((message) => message.isStreaming);
}
