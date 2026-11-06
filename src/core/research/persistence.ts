import { useResearchStore, type ResearchStore } from "./store";
import type { PersistedResearchState } from "./types";

export const STORAGE_KEY = "ai-search:research:v1";

export function loadPersisted(): PersistedResearchState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedResearchState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serialize(state: ResearchStore): PersistedResearchState {
  return {
    version: 1,
    threadId: state.threadId,
    messages: state.messages,
    researchIds: state.researchIds,
    planIdByResearch: state.planIdByResearch,
    reportIdByResearch: state.reportIdByResearch,
    activityIdsByResearch: state.activityIdsByResearch,
    ongoingResearchId: state.ongoingResearchId,
    openResearchId: state.openResearchId,
    activeTabByResearch: state.activeTabByResearch,
    interruptByResearch: state.interruptByResearch,
    lastSeq: state.lastSeq,
    activeRunId: state.activeRunId,
    lastQuery: state.lastQuery,
    savedAt: Date.now(),
  };
}

export function saveNow(state: ResearchStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(state)));
  } catch {
    // Quota or private-mode errors must never break the running stream.
  }
}

/**
 * Debounced persistence of the research state. Returns a cleanup function.
 * `pagehide` flushes synchronously so a refresh keeps the newest chunks.
 */
export function startPersistence(delay = 150): () => void {
  let timer: number | undefined;
  const flush = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    saveNow(useResearchStore.getState());
  };
  const unsubscribe = useResearchStore.subscribe(() => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      saveNow(useResearchStore.getState());
    }, delay);
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  return () => {
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
    if (timer !== undefined) window.clearTimeout(timer);
    unsubscribe();
  };
}
