import { describe, expect, it } from "vitest";
import { reduceEvent, type ResearchData } from "./events";
import type { ResearchEvent } from "./types";

function initial(): ResearchData {
  return {
    threadId: "thread-1",
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
}

function event(seq: number, partial: Partial<ResearchEvent> & { type: string }): ResearchEvent {
  return {
    thread_id: "thread-1",
    run_id: "run-1",
    seq,
    ...partial,
  };
}

function plannerStart(seq: number, id = "plan-1"): ResearchEvent {
  return event(seq, {
    type: "message_start",
    id,
    agent: "planner",
    role: "assistant",
  });
}

describe("reduceEvent", () => {
  it("is idempotent for a replayed event with the same seq", () => {
    let state = initial();
    const chunk = event(1, {
      type: "message_chunk",
      id: "m-1",
      agent: "planner",
      role: "assistant",
      content: "Hello",
    });

    state = reduceEvent(state, chunk);
    state = reduceEvent(state, chunk);
    state = reduceEvent(state, { ...chunk, content: "HelloHello" });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Hello");
    expect(state.lastSeq).toBe(1);
  });

  it("concatenates tool arg fragments and parses them on finish", () => {
    const rawArgs = JSON.stringify({ query: "react server components", limit: 5 });
    const split = Math.floor(rawArgs.length / 2);

    let state = initial();
    const events: ResearchEvent[] = [
      plannerStart(1),
      event(2, {
        type: "message_chunk",
        id: "plan-1",
        agent: "planner",
        role: "assistant",
        content: "### 研究计划",
      }),
      event(3, { type: "finish", id: "plan-1", agent: "planner", role: "assistant", finish_reason: "stop" }),
      event(4, { type: "message_start", id: "researcher-1", agent: "researcher", role: "assistant" }),
      event(5, {
        type: "tool_calls",
        id: "researcher-1",
        agent: "researcher",
        role: "assistant",
        tool_calls: [{ id: "call-1", index: 0, name: "web_search", args: {} }],
      }),
      event(6, {
        type: "tool_call_chunks",
        id: "researcher-1",
        agent: "researcher",
        role: "assistant",
        tool_call_chunks: [{ id: "call-1", index: 0, name: "web_search", args: rawArgs.slice(0, split) }],
      }),
      event(7, {
        type: "tool_call_chunks",
        id: "researcher-1",
        agent: "researcher",
        role: "assistant",
        tool_call_chunks: [{ id: "call-1", index: 0, name: "web_search", args: rawArgs.slice(split) }],
      }),
      event(8, {
        type: "tool_call_result",
        id: "researcher-1",
        agent: "researcher",
        role: "assistant",
        tool_call_id: "call-1",
        content: JSON.stringify([{ type: "page", index: 1, title: "Doc", url: "https://example.com" }]),
      }),
      event(9, { type: "finish", id: "researcher-1", agent: "researcher", role: "assistant", finish_reason: "stop" }),
    ];
    for (const item of events) state = reduceEvent(state, item);

    const message = state.messages.find((item) => item.id === "researcher-1");
    expect(message?.toolCalls[0].argChunks?.join("")).toBe(rawArgs);
    expect(message?.toolCalls[0].args).toEqual({ query: "react server components", limit: 5 });
    expect(message?.toolCalls[0].result).toContain("https://example.com");
    expect(message?.isStreaming).toBe(false);

    // Lifecycle: plan is skipped in Activities, the research is still open.
    expect(state.researchIds).toEqual(["researcher-1"]);
    expect(state.planIdByResearch["researcher-1"]).toBe("plan-1");
    expect(state.activityIdsByResearch["researcher-1"]).toEqual(["plan-1", "researcher-1"]);
    expect(state.openResearchId).toBe("researcher-1");
    expect(state.ongoingResearchId).toBe("researcher-1");
  });

  it("unlocks and auto-selects Report on the first reporter message, then respects manual tabs", () => {
    let state = initial();
    const events: ResearchEvent[] = [
      plannerStart(1),
      event(2, { type: "message_start", id: "researcher-1", agent: "researcher", role: "assistant" }),
      event(3, { type: "finish", id: "researcher-1", agent: "researcher", role: "assistant", finish_reason: "stop" }),
      event(4, { type: "message_start", id: "reporter-1", agent: "reporter", role: "assistant" }),
    ];
    for (const item of events) state = reduceEvent(state, item);

    const researchId = state.ongoingResearchId as string;
    expect(state.reportIdByResearch[researchId]).toBe("reporter-1");
    expect(state.activeTabByResearch[researchId]).toBe("report");
    expect(state.activityIdsByResearch[researchId]).toEqual([
      "plan-1",
      "researcher-1",
      "reporter-1",
    ]);

    // A manual switch away from Report must not be stolen back by later chunks.
    state.activeTabByResearch[researchId] = "activities";
    state = reduceEvent(
      state,
      event(5, {
        type: "message_chunk",
        id: "reporter-1",
        agent: "reporter",
        role: "assistant",
        content: "# Report",
      }),
    );
    expect(state.activeTabByResearch[researchId]).toBe("activities");

    // The reporter finishing ends the research; the next activity opens a new
    // research with Activities selected again.
    state = reduceEvent(
      state,
      event(6, { type: "finish", id: "reporter-1", agent: "reporter", role: "assistant", finish_reason: "stop" }),
    );
    expect(state.ongoingResearchId).toBeNull();

    state = reduceEvent(
      state,
      event(7, { type: "message_start", id: "researcher-2", agent: "researcher", role: "assistant" }),
    );
    expect(state.researchIds).toEqual(["researcher-1", "researcher-2"]);
    expect(state.ongoingResearchId).toBe("researcher-2");
    expect(state.activeTabByResearch["researcher-2"]).toBe("activities");
    expect(state.reportIdByResearch["researcher-2"]).toBeUndefined();
  });

  it("allows Report when the reporter is the first activity", () => {
    let state = initial();
    state = reduceEvent(state, plannerStart(1));
    state = reduceEvent(
      state,
      event(2, {
        type: "message_chunk",
        id: "plan-1",
        agent: "planner",
        role: "assistant",
        content: "plan",
      }),
    );
    state = reduceEvent(
      state,
      event(3, { type: "message_start", id: "reporter-1", agent: "reporter", role: "assistant" }),
    );

    expect(state.researchIds).toEqual(["reporter-1"]);
    expect(state.activityIdsByResearch["reporter-1"]).toEqual(["plan-1", "reporter-1"]);
    expect(state.reportIdByResearch["reporter-1"]).toBe("reporter-1");
    expect(state.activeTabByResearch["reporter-1"]).toBe("report");
  });

  it("ignores events from another thread or a stale run", () => {
    let state = initial();
    state = reduceEvent(state, plannerStart(1));
    const before = state;

    state = reduceEvent(state, { ...plannerStart(2, "plan-2"), thread_id: "other-thread" });
    expect(state).toBe(before);

    state = reduceEvent(state, { ...plannerStart(2, "plan-2"), run_id: "stale-run" });
    expect(state).toBe(before);

    state = reduceEvent(state, plannerStart(2, "plan-2"));
    expect(state.messages.map((message) => message.id)).toContain("plan-2");
  });

  it("finalizes partial tool args even when they are invalid JSON", () => {
    let state = initial();
    state = reduceEvent(state, event(1, {
      type: "tool_calls",
      id: "researcher-1",
      agent: "researcher",
      role: "assistant",
      tool_calls: [{ id: "call-1", index: 0, name: "web_search", args: { query: "fallback" } }],
    }));
    state = reduceEvent(state, event(2, {
      type: "tool_call_chunks",
      id: "researcher-1",
      agent: "researcher",
      role: "assistant",
      tool_call_chunks: [{ id: "call-1", index: 0, name: "web_search", args: '{"query": "trunc' }],
    }));
    state = reduceEvent(state, event(3, {
      type: "finish",
      id: "researcher-1",
      agent: "researcher",
      role: "assistant",
      finish_reason: "stop",
    }));

    const call = state.messages[0].toolCalls[0];
    expect(call.args).toEqual({ query: "fallback" });
    expect(call.argsError).toBeTruthy();
  });
});
