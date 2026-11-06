export type Agent = "planner" | "researcher" | "coder" | "reporter" | "other";
export type Role = "user" | "assistant" | "tool";
export type TabKey = "activities" | "report";

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments. While `argChunks` are still streaming this may be the
   *  provisional value sent with `tool_calls`; on finish the concatenated
   *  chunks win when they form valid JSON. */
  args: Record<string, unknown>;
  /** Raw JSON fragments from `tool_call_chunks`, in arrival order. */
  argChunks?: string[];
  /** Raw result payload: a JSON string or plain text. undefined = running. */
  result?: string;
  argsError?: string;
}

export interface AgentMessage {
  id: string;
  agent: Agent;
  role: Role;
  content: string;
  isStreaming: boolean;
  toolCalls: ToolCall[];
  error?: string;
  finishReason?: string;
  createdAt: number;
}

/** One SSE event after JSON decoding. The SSE `event:` name lands in `type`. */
export interface ResearchEvent {
  type: string;
  seq?: number;
  run_id?: string;
  thread_id?: string;
  id?: string;
  agent?: Agent;
  role?: Role;
  finish_reason?: string;
  content?: string;
  tool_calls?: ToolCallChunk[];
  tool_call_chunks?: ToolCallChunk[];
  tool_call_id?: string;
  options?: unknown;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ToolCallChunk {
  id?: string;
  index?: number;
  name?: string;
  args?: unknown;
}

export interface PersistedResearchState {
  version: 1;
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
  savedAt: number;
}
