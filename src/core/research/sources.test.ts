import { describe, expect, it } from "vitest";
import { collectSources, linkifyCitations } from "./sources";
import type { AgentMessage } from "./types";

describe("linkifyCitations", () => {
  it("links numbered citations and leaves fenced code alone", () => {
    const sources = new Map([
      [1, { index: 1, title: 'Anthropic "guide"', url: "https://example.com/a", type: "page" }],
    ]);
    const markdown = [
      "结论来自第一份资料[1]。",
      "",
      "```",
      "print('[1]')",
      "```",
    ].join("\n");

    const linked = linkifyCitations(markdown, sources);
    expect(linked).toContain('[\\[1\\]](https://example.com/a "Anthropic  guide")');
    expect(linked).toContain("print('[1]')");
    // Never double-link an existing markdown link.
    expect(linkifyCitations("[1](https://existing.test)", sources)).toBe(
      "[1](https://existing.test)",
    );
  });

  it("collects sources by server-assigned index and rejects unsafe URLs", () => {
    const message: AgentMessage = {
      id: "m",
      agent: "researcher",
      role: "assistant",
      content: "",
      isStreaming: false,
      createdAt: 0,
      toolCalls: [
        {
          id: "call",
          name: "web_search",
          args: {},
          result: JSON.stringify([
            { type: "page", index: 2, title: "Safe", url: "https://safe.test/x" },
            { type: "page", index: 3, title: "Unsafe", url: "javascript:alert(1)" },
          ]),
        },
      ],
    };

    const sources = collectSources([message]);
    expect(sources.get(2)?.title).toBe("Safe");
    expect(sources.has(3)).toBe(false);
  });
});
