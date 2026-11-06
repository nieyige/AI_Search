import type {
  Agent,
  AgentMessage,
  ResearchEvent,
  TabKey,
  ToolCall,
  ToolCallChunk,
} from "./types";

/** The slice of state the event reducer owns. */
export interface ResearchData {
  threadId: string;
  messages: AgentMessage[];
  researchIds: string[];
  planIdByResearch: Record<string, string | undefined>;
  reportIdByResearch: Record<string, string>;
  activityIdsByResearch: Record<string, string[]>;
  ongoingResearchId: string | null;
  openResearchId: string | null;
  activeTabByResearch: Record<string, TabKey>;
  interruptByResearch: Record<string, unknown>;
  lastSeq: number;
  activeRunId: string | null;
  lastQuery: string;
  lastError: string | null;
}

const ACTIVITY_AGENTS = new Set<Agent>(["researcher", "coder", "reporter"]);

const KNOWN_EVENTS = new Set([
  "message_start",
  "message_chunk",
  "tool_calls",
  "tool_call_chunks",
  "tool_call_result",
  "finish",
  "interrupt",
  "error",
  "done",
]);

function cloneMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    toolCalls: message.toolCalls.map((call) => ({
      ...call,
      args: { ...call.args },
      argChunks: call.argChunks ? [...call.argChunks] : undefined,
    })),
  };
}

function cloneData(state: ResearchData): ResearchData {
  return {
    ...state,
    messages: state.messages.map(cloneMessage),
    researchIds: [...state.researchIds],
    planIdByResearch: { ...state.planIdByResearch },
    reportIdByResearch: { ...state.reportIdByResearch },
    activityIdsByResearch: Object.fromEntries(
      Object.entries(state.activityIdsByResearch).map(([key, ids]) => [key, [...ids]]),
    ),
    activeTabByResearch: { ...state.activeTabByResearch },
    interruptByResearch: { ...state.interruptByResearch },
  };
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === "string" && args.trim()) {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // partial JSON while streaming; keep the empty object until finish
    }
  }
  return {};
}

function findMessage(state: ResearchData, id: string | undefined) {
  if (!id) return undefined;
  return state.messages.find((message) => message.id === id);
}

function messageIndex(state: ResearchData, id: string | undefined) {
  if (!id) return -1;
  return state.messages.findIndex((message) => message.id === id);
}

/**
 * Create (or update) the message an event belongs to. Chunks may legally
 * arrive before `message_start`, so every event can materialise its message.
 */
function ensureMessage(state: ResearchData, event: ResearchEvent): AgentMessage | null {
  if (!event.id) return null;
  let message = findMessage(state, event.id);
  if (!message) {
    message = {
      id: event.id,
      agent: event.agent ?? "other",
      role: event.role ?? "assistant",
      content: "",
      isStreaming: true,
      toolCalls: [],
      createdAt: Date.now(),
    };
    state.messages.push(message);
  } else {
    if (event.agent) message.agent = event.agent;
    if (event.role) message.role = event.role;
    if (event.type !== "finish" && event.type !== "error" && event.type !== "interrupt") {
      message.isStreaming = true;
    }
  }
  return message;
}

/**
 * Research lifecycle (spec §5):
 *  - the first researcher/coder/reporter message opens a research, whose plan
 *    is the most recent preceding planner message;
 *  - later messages are appended to the same research, deduplicated by id;
 *  - the first reporter message unlocks Report and auto-selects it.
 */
function attachResearch(state: ResearchData, messageId: string): void {
  const index = messageIndex(state, messageId);
  if (index < 0) return;
  const message = state.messages[index];
  if (!ACTIVITY_AGENTS.has(message.agent) || message.role === "user") return;

  let researchId = state.ongoingResearchId;
  if (!researchId) {
    researchId = message.id;
    let planId: string | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = state.messages[i];
      if (candidate.agent === "planner" && candidate.role !== "user") {
        planId = candidate.id;
        break;
      }
    }
    if (!state.researchIds.includes(researchId)) state.researchIds.push(researchId);
    state.planIdByResearch[researchId] = planId;
    state.activityIdsByResearch[researchId] = planId ? [planId, message.id] : [message.id];
    state.ongoingResearchId = researchId;
    state.openResearchId = researchId;
    state.activeTabByResearch[researchId] = "activities";
  } else {
    const activities = state.activityIdsByResearch[researchId] ?? [];
    if (!activities.includes(message.id)) {
      activities.push(message.id);
      state.activityIdsByResearch[researchId] = activities;
    }
  }

  if (message.agent === "reporter") {
    const hadReport = Boolean(state.reportIdByResearch[researchId]);
    state.reportIdByResearch[researchId] = message.id;
    // Auto-switch only on the *first* report. Manual tab choice is otherwise
    // preserved until a new research starts.
    if (!hadReport) state.activeTabByResearch[researchId] = "report";
  }
}

function appendToolCall(message: AgentMessage, chunk: ToolCallChunk, fallbackIndex: number): ToolCall {
  const id = chunk.id ?? `${message.id}-tool-${chunk.index ?? fallbackIndex}`;
  let call = message.toolCalls.find((candidate) => candidate.id === id);
  if (!call) {
    call = {
      id,
      name: chunk.name ?? "tool",
      args: normalizeArgs(chunk.args),
      argChunks: typeof chunk.args === "string" ? [chunk.args] : undefined,
    };
    message.toolCalls.push(call);
    return call;
  }
  if (chunk.name) call.name = chunk.name;
  if (typeof chunk.args === "string") {
    call.argChunks = [...(call.argChunks ?? []), chunk.args];
    const joined = call.argChunks.join("");
    try {
      const parsed = JSON.parse(joined);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        call.args = parsed as Record<string, unknown>;
      }
    } catch {
      // still streaming
    }
  } else if (chunk.args && typeof chunk.args === "object") {
    call.args = { ...call.args, ...(chunk.args as Record<string, unknown>) };
  }
  return call;
}

function finalizeToolArgs(message: AgentMessage): void {
  for (const call of message.toolCalls) {
    if (!call.argChunks?.length) continue;
    const raw = call.argChunks.join("");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        call.args = parsed as Record<string, unknown>;
        call.argsError = undefined;
      } else {
        call.argsError = "工具参数不是 JSON 对象";
      }
    } catch {
      call.argsError = "工具参数流不完整";
    }
  }
}

function findToolCall(state: ResearchData, event: ResearchEvent) {
  const message = findMessage(state, event.id);
  if (message) {
    const call = message.toolCalls.find((candidate) => candidate.id === event.tool_call_id);
    if (call) return { message, call };
  }
  for (const candidateMessage of state.messages) {
    const call = candidateMessage.toolCalls.find(
      (candidate) => candidate.id === event.tool_call_id,
    );
    if (call) return { message: candidateMessage, call };
  }
  return null;
}

/**
 * Pure reducer: applies one SSE event and returns the next research state.
 * Unknown events and duplicate seq values are ignored (spec §4).
 */
export function reduceEvent(prev: ResearchData, event: ResearchEvent): ResearchData {
  if (!event || typeof event.type !== "string" || !KNOWN_EVENTS.has(event.type)) return prev;
  if (event.thread_id && event.thread_id !== prev.threadId) return prev;

  let activeRunId = prev.activeRunId;
  let lastSeq = prev.lastSeq;
  if (event.run_id) {
    if (activeRunId && event.run_id !== activeRunId) return prev;
    if (!activeRunId) {
      activeRunId = event.run_id;
      lastSeq = 0;
    }
  }
  if (typeof event.seq === "number") {
    // The server numbers events monotonically per run; replaying an old seq is
    // a duplicate, not new content.
    if (event.seq <= lastSeq) return prev;
    lastSeq = event.seq;
  } else if (!event.run_id && !event.id && event.type !== "error" && event.type !== "done") {
    return prev;
  }

  const state = cloneData(prev);
  state.activeRunId = activeRunId;
  state.lastSeq = lastSeq;

  switch (event.type) {
    case "message_start": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      message.isStreaming = true;
      attachResearch(state, message.id);
      break;
    }

    case "message_chunk": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      message.content += event.content ?? "";
      message.isStreaming = true;
      attachResearch(state, message.id);
      break;
    }

    case "tool_calls": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      for (const [index, chunk] of (event.tool_calls ?? []).entries()) {
        appendToolCall(message, chunk, index);
      }
      // Some servers put both fields on the same event.
      for (const [index, chunk] of (event.tool_call_chunks ?? []).entries()) {
        appendToolCall(message, chunk, index);
      }
      attachResearch(state, message.id);
      break;
    }

    case "tool_call_chunks": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      for (const [index, chunk] of (event.tool_call_chunks ?? []).entries()) {
        appendToolCall(message, chunk, index);
      }
      attachResearch(state, message.id);
      break;
    }

    case "tool_call_result": {
      let message = ensureMessage(state, event);
      if (!message) {
        const found = findToolCall(state, event);
        message = found?.message ?? null;
      }
      if (!message) return prev;
      const toolCall = message.toolCalls.find((call) => call.id === event.tool_call_id);
      const fallback = findToolCall(state, event);
      const target = toolCall ?? fallback?.call ?? appendToolCall(message, {
        id: event.tool_call_id,
        name: "tool",
      }, message.toolCalls.length);
      const raw = typeof event.content === "string" ? event.content : JSON.stringify(event.content ?? "");
      target.result = raw;
      attachResearch(state, message.id);
      break;
    }

    case "finish": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      message.isStreaming = false;
      message.finishReason = event.finish_reason ?? "stop";
      finalizeToolArgs(message);
      attachResearch(state, message.id);
      if (message.agent === "reporter") {
        // Step 3: the research ends when the reporter's stream ends.
        state.ongoingResearchId = null;
      }
      break;
    }

    case "interrupt": {
      const message = ensureMessage(state, event);
      if (!message) return prev;
      message.isStreaming = false;
      message.finishReason = "interrupt";
      const researchId =
        (message.agent === "reporter" && state.ongoingResearchId) ||
        Object.entries(state.reportIdByResearch).find(([, id]) => id === message.id)?.[0] ||
        state.ongoingResearchId;
      if (researchId) state.interruptByResearch[researchId] = event.options ?? null;
      break;
    }

    case "error": {
      if (event.code === "session_expired") {
        for (const message of state.messages) {
          if (message.isStreaming) {
            message.isStreaming = false;
            message.finishReason = "interrupted";
          }
        }
        state.ongoingResearchId = null;
      }
      const message = findMessage(state, event.id);
      if (message) {
        message.error = event.message ?? "请求失败";
        message.isStreaming = false;
      }
      // Per-tool/per-message failures stay on the card; only fatal errors
      // (no message id) or an expired session surface as a global banner.
      if (event.message && (!event.id || event.code === "session_expired")) {
        state.lastError = event.message;
      }
      break;
    }

    case "done": {
      // Safety net: a stream must never leave a permanently spinning message.
      for (const message of state.messages) {
        if (message.isStreaming) {
          message.isStreaming = false;
          if (!message.finishReason) message.finishReason = "stop";
        }
      }
      state.ongoingResearchId = null;
      break;
    }
  }

  return state;
}
