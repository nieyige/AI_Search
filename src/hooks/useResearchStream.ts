import { useCallback, useEffect, useRef } from "react";
import { useResearchStore } from "@/core/research/store";
import type { ResearchEvent } from "@/core/research/types";

const EVENT_TYPES = [
  "message_start",
  "message_chunk",
  "tool_calls",
  "tool_call_chunks",
  "tool_call_result",
  "finish",
  "interrupt",
  "error",
  "done",
] as const;

export interface ResearchStream {
  start: (query: string) => void;
  retry: () => void;
  disconnect: () => void;
}

export function useResearchStream(): ResearchStream {
  const sourceRef = useRef<EventSource | null>(null);
  // When the page is being unloaded we must not treat the EventSource closing
  // as a real disconnect: doing so would flip the persisted research to
  // "interrupted" right before the refresh and make resume impossible.
  const unloadingRef = useRef(false);

  const disconnect = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const connect = useCallback(
    (query: string, resume = false) => {
      disconnect();
      const state = useResearchStore.getState();
      const params = new URLSearchParams({
        q: query,
        thread_id: state.threadId,
      });
      if (resume) {
        params.set("resume", "1");
        params.set("last_event_id", String(state.lastSeq));
        if (state.activeRunId) params.set("run_id", state.activeRunId);
      } else {
        params.set("last_event_id", "0");
      }

      const source = new EventSource(`/api/research?${params.toString()}`);
      sourceRef.current = source;

      const handle = (raw: Event) => {
        if (sourceRef.current !== source) return;
        const message = raw as MessageEvent<string>;
        let event: ResearchEvent;
        try {
          event = JSON.parse(message.data) as ResearchEvent;
        } catch {
          return;
        }
        const type = (message.type || event.type || "").trim();
        if (!type) return;
        useResearchStore.getState().processEvent({ ...event, type });
        if (type === "done") {
          disconnect();
          return;
        }
        if (type === "error" && event.code === "session_expired") {
          useResearchStore.getState().markInterrupted(event.message ?? "研究连接已失效");
          disconnect();
        }
      };

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, handle as EventListener);
      }

      // EventSource's own "error" has no data. A CLOSED source will not retry;
      // CONNECTING means the browser is reconnecting on its own (the server
      // replays the run from Last-Event-ID), so we leave the UI alone.
      source.addEventListener("error", (raw) => {
        if (sourceRef.current !== source || unloadingRef.current) return;
        const event = raw as MessageEvent<string>;
        if (event.data) {
          // Server-sent event: error; already handled by the typed listener.
          return;
        }
        if (source.readyState === EventSource.CLOSED) {
          // Delay this decision: on refresh/navigation the source closes as
          // part of unload, and marking immediately would overwrite the
          // resumable state that the pagehide flush is about to persist.
          window.setTimeout(() => {
            if (sourceRef.current !== source || unloadingRef.current) return;
            if (document.visibilityState === "hidden") return;
            useResearchStore.getState().markInterrupted("连接已断开，请重试");
          }, 1500);
        }
      });
    },
    [disconnect],
  );

  const start = useCallback(
    (query: string) => {
      useResearchStore.getState().beginQuery(query);
      connect(query, false);
    },
    [connect],
  );

  const retry = useCallback(() => {
    const query = useResearchStore.getState().lastQuery;
    if (!query) return;
    useResearchStore.getState().restartRun();
    connect(query, false);
  }, [connect]);

  // Resume an interrupted page load: the server keeps a bounded event log and
  // replays everything after our last seq. If the session is gone the server
  // sends `session_expired`, which marks the partial output as interrupted.
  useEffect(() => {
    const onPageHide = () => {
      unloadingRef.current = true;
      disconnect();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      unloadingRef.current = false;
      if (!event.persisted) return;
      // Returning from bfcache: re-attach if the run is still in flight.
      const state = useResearchStore.getState();
      if (state.ongoingResearchId && state.lastQuery && state.activeRunId) {
        connect(state.lastQuery, true);
      }
    };
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    const state = useResearchStore.getState();
    if (state.ongoingResearchId && state.lastQuery && state.activeRunId) {
      connect(state.lastQuery, true);
    }

    return () => {
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      disconnect();
    };
  }, [connect, disconnect]);

  return { start, retry, disconnect };
}
