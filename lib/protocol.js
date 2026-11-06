/**
 * Helpers for the message-based SSE protocol.
 *
 * Every event is emitted through the run manager, which adds `seq / run_id /
 * thread_id`. These helpers only shape the payload.
 */

export const TOOL_ARG_CHUNK_SIZE = 16;

export function emitMessageStart(emit, id, agent, role = "assistant") {
  emit("message_start", { id, agent, role });
}

export function emitMessageChunk(emit, id, agent, content, role = "assistant") {
  emit("message_chunk", { id, agent, role, content });
}

/**
 * Establish tool-call placeholders, then stream the JSON arguments as
 * fragments. The parsed `args` sent on `tool_calls` lets the UI show the search
 * query immediately; the fragments exercise the streaming-args code path and
 * overwrite `args` once complete.
 */
export function emitToolCalls(
  emit,
  { id, agent, calls, role = "assistant", chunkSize = TOOL_ARG_CHUNK_SIZE, streamArgs = true },
) {
  emit("tool_calls", {
    id,
    agent,
    role,
    tool_calls: calls.map((call, index) => ({
      id: call.id,
      index,
      name: call.name,
      args: call.args ?? {},
    })),
  });

  if (!streamArgs) return;

  calls.forEach((call, index) => {
    const json = JSON.stringify(call.args ?? {});
    for (let offset = 0; offset < json.length; offset += chunkSize) {
      emit("tool_call_chunks", {
        id,
        agent,
        role,
        tool_call_chunks: [
          {
            id: call.id,
            index,
            name: call.name,
            args: json.slice(offset, offset + chunkSize),
          },
        ],
      });
    }
  });
}

export function emitToolResult(emit, { id, agent, toolCallId, content, role = "assistant" }) {
  emit("tool_call_result", {
    id,
    agent,
    role,
    tool_call_id: toolCallId,
    content: typeof content === "string" ? content : JSON.stringify(content),
  });
}

export function emitFinish(emit, { id, agent, finishReason = "stop", role = "assistant" }) {
  emit("finish", { id, agent, role, finish_reason: finishReason });
}
