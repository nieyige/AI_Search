import { describe, expect, it } from "vitest";
import { runMockResearch } from "../../../lib/mock.js";
import { reduceEvent } from "./events";

function initial() {
  return {
    threadId: "thread-mock",
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

describe("mock research stream", () => {
  it("drives the full Activities -> Report flow through the reducer", async () => {
    let state = initial();
    let seq = 0;
    const controller = new AbortController();

    const emit = (type, payload) => {
      seq += 1;
      state = reduceEvent(state, {
        type,
        seq,
        run_id: "run-mock",
        thread_id: "thread-mock",
        ...payload,
      });
    };

    await runMockResearch("AI agent 产品进展", emit, controller.signal, { fast: true });

    const researchId = state.researchIds[0];
    const activities = state.activityIdsByResearch[researchId];

    expect(state.researchIds).toHaveLength(1);
    // plan + web_search + crawl + python + mcp + reporter
    expect(activities).toHaveLength(6);
    expect(state.reportIdByResearch[researchId]).toBeTruthy();
    expect(state.activeTabByResearch[researchId]).toBe("report");
    expect(state.ongoingResearchId).toBeNull();

    const reportId = state.reportIdByResearch[researchId];
    const report = state.messages.find((message) => message.id === reportId);
    expect(report.content).toContain("AI Agent 产品");
    expect(report.isStreaming).toBe(false);
    expect(report.finishReason).toBe("stop");

    const searchMessage = state.messages.find((message) =>
      message.toolCalls.some((call) => call.name === "web_search"),
    );
    const items = JSON.parse(searchMessage.toolCalls[0].result);
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({ type: "page", index: 1 });
    // Tool arguments must round-trip from fragments without corruption.
    expect(searchMessage.toolCalls[0].argsError).toBeUndefined();
    expect(searchMessage.toolCalls[0].args).toEqual({ query: "AI agent product 2026" });
  });

  it("shows an empty search result instead of an endless skeleton", async () => {
    let state = initial();
    let seq = 0;
    const controller = new AbortController();

    await runMockResearch(
      "empty",
      (type, payload) => {
        seq += 1;
        state = reduceEvent(state, {
          type,
          seq,
          run_id: "run-empty",
          thread_id: "thread-mock",
          ...payload,
        });
      },
      controller.signal,
      { fast: true, scenario: "empty" },
    );

    const searchMessage = state.messages.find((message) =>
      message.toolCalls.some((call) => call.name === "web_search"),
    );
    expect(searchMessage.toolCalls[0].result).toBe("[]");
    expect(searchMessage.isStreaming).toBe(false);
  });

  it("preserves partial report content on an error", async () => {
    let state = initial();
    let seq = 0;
    const controller = new AbortController();

    await runMockResearch(
      "error case",
      (type, payload) => {
        seq += 1;
        state = reduceEvent(state, {
          type,
          seq,
          run_id: "run-error",
          thread_id: "thread-mock",
          ...payload,
        });
      },
      controller.signal,
      { fast: true, scenario: "error" },
    );

    const researchId = state.researchIds[0];
    const reportId = state.reportIdByResearch[researchId];
    const report = state.messages.find((message) => message.id === reportId);
    expect(report.content.length).toBeGreaterThan(0);
    expect(report.error).toContain("模拟错误");
    expect(report.finishReason).toBe("error");
    expect(state.ongoingResearchId).toBeNull();
  });
});
