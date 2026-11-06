import { randomUUID } from "node:crypto";
import {
  emitFinish,
  emitMessageChunk,
  emitMessageStart,
  emitToolCalls,
  emitToolResult,
} from "./protocol.js";

/** Demo stream that needs no API keys. Powers MOCK=1 and the E2E fixture. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function streamText(
  emit,
  signal,
  { id, agent, role = "assistant", text, chunk = 14, delay = 20, pace = 1 },
) {
  emitMessageStart(emit, id, agent, role);
  for (let offset = 0; offset < text.length; offset += chunk) {
    if (signal.aborted) return;
    emitMessageChunk(emit, id, agent, text.slice(offset, offset + chunk), role);
    await sleep(delay * pace, signal);
  }
  if (!signal.aborted) emitFinish(emit, { id, agent, role });
}

async function streamArgs(
  emit,
  signal,
  { id, agent, toolCallId, name, args, delay = 26, pace = 1 },
) {
  const json = JSON.stringify(args);
  for (let offset = 0; offset < json.length; offset += 12) {
    if (signal.aborted) return;
    emit("tool_call_chunks", {
      id,
      agent,
      role: "assistant",
      tool_call_chunks: [
        {
          id: toolCallId,
          index: 0,
          name,
          args: json.slice(offset, offset + 12),
        },
      ],
    });
    await sleep(delay * pace, signal);
  }
}

const SEARCH_RESULTS = [
  {
    type: "page",
    index: 1,
    title: "Anthropic — Building effective agents",
    url: "https://www.anthropic.com/research/building-effective-agents",
    snippet:
      "A practical guide to agent patterns: prompt chaining, routing, parallelization, orchestrator-workers and evaluator-optimizer loops.",
    favicon: "https://www.anthropic.com/favicon.ico",
  },
  {
    type: "page",
    index: 2,
    title: "OpenAI — A practical guide to building agents",
    url: "https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf",
    snippet:
      "Defines what an agent is, when it is worth the cost, and how tools, guardrails and human oversight fit together.",
    favicon: "https://openai.com/favicon.ico",
  },
  {
    type: "page",
    index: 3,
    title: "LangGraph: Multi-agent systems",
    url: "https://langchain-ai.github.io/langgraph/concepts/multi_agent/",
    snippet:
      "Multi-agent architectures including supervisor, swarm and hierarchical teams, with trade-offs for control and context isolation.",
    favicon: "https://langchain-ai.github.io/favicon.ico",
  },
  {
    type: "page",
    index: 4,
    title: "The state of AI agents in 2026",
    url: "https://example.com/reports/state-of-agents-2026",
    snippet:
      "Survey of 1,200 product teams: reliability, evaluation and cost remain the top blockers for production agent deployments.",
    favicon: "https://example.com/favicon.ico",
  },
  {
    type: "image",
    index: 5,
    title: "Agent workflow diagram",
    url: "https://example.com/images/agent-workflow",
    thumbnail: "https://picsum.photos/seed/agent-workflow/240/160",
  },
  {
    type: "image",
    index: 6,
    title: "Evaluation loop",
    url: "https://example.com/images/eval-loop",
    thumbnail: "https://picsum.photos/seed/eval-loop/240/160",
  },
];

const REPORT = `# AI Agent 产品：2026 年的关键进展

## 结论先行

2026 年的 Agent 产品已经从“能演示”走向“能交付”：行业共识集中在**可控的工作流编排、可观测性与评测闭环**三件事上，而不是单纯追求更长的自主执行链。产品团队更愿意把 Agent 拆成可预测的多步流程，并在关键节点保留人工确认。[1][3]

## 1. 从单体 Agent 到工作流编排

主流实现把“Agent”理解为一组可组合的模式：

- **Prompt chaining**：把复杂任务拆成串行子任务，逐段校验。
- **Routing**：先用分类器选择专用流程，降低上下文负担。
- **Orchestrator-workers**：由一个编排者动态拆解任务，再汇总子结果。
- **Evaluator-optimizer**：让另一个模型专门给输出打分并驱动重试。

> 关键变化：团队不再默认“全自主”，而是优先选择最简单、最容易测试的编排方式。[1]

## 2. 评测与可观测性成为基础设施

| 能力 | 2024 | 2026 |
| --- | --- | --- |
| 轨迹追踪 | 可选 | 默认开启 |
| 离线评测集 | 少量 | 按场景分层 |
| 成本预算 | 事后观察 | 运行时熔断 |
| 人工介入 | 异常兜底 | 流程内节点 |

产品侧最常见的做法是为每条研究轨迹记录工具调用、检索证据与最终结论，再用评测集做回归。[2][4]

## 3. 一个典型的检索型 Agent

\`\`\`python
def research(question: str) -> Report:
    plan = planner(question)
    evidence = retrieve(plan.keywords)
    if not sufficient(evidence):
        plan = replan(question, evidence)
    return reporter(question, evidence)
\`\`\`

在界面上，用户看到的不应只是最终答案，而是：

1. 研究了什么；
2. 引用了哪些证据；
3. 哪些结论仍不确定。

## 风险与未解问题

- **评测成本**：高质量人工标注仍然是瓶颈。
- **提示注入**：来自网页的工具输出必须被当作不可信数据。[2]
- **责任边界**：当 Agent 自主调用外部工具时，审计与回滚机制仍不成熟。

## 小结

2026 年的赢家不是“最自主”的 Agent，而是**最可解释、最可评测、最容易被人接管**的 Agent 产品。[1][3][4]
`;

export async function runMockResearch(query, emit, signal, options = {}) {
  const scenario = options.scenario ?? "";
  const pace = options.fast ? 0.01 : 1;
  const wait = (ms) => sleep(ms * pace, signal);
  const planId = `planner-${randomUUID()}`;

  await streamText(emit, signal, {
    id: planId,
    agent: "planner",
    text: `### 研究计划\n\n围绕「${query}」先梳理产品进展，再核对工程实践与评测数据。\n\n**本轮检索关键词**\n\n- \`AI agent product 2026\`\n- \`agent evaluation best practices\`\n`,
    chunk: 18,
    delay: 26,
    pace,
  });
  if (signal.aborted) return;

  // web_search activity
  const searchId = `researcher-${randomUUID()}`;
  const searchTool = `web_search-${randomUUID()}`;
  emitMessageStart(emit, searchId, "researcher");
  emitMessageChunk(
    emit,
    searchId,
    "researcher",
    "**第 1 轮** · 正在检索 `AI agent product 2026`",
  );
  emitToolCalls(emit, {
    id: searchId,
    agent: "researcher",
    calls: [{ id: searchTool, name: "web_search", args: { query: "AI agent product 2026" } }],
    streamArgs: false,
  });
  await streamArgs(emit, signal, {
    id: searchId,
    agent: "researcher",
    toolCallId: searchTool,
    name: "web_search",
    args: { query: "AI agent product 2026" },
    pace,
  });
  if (signal.aborted) return;
  await wait(1300);
  if (signal.aborted) return;

  const results = scenario === "empty" ? [] : SEARCH_RESULTS;
  emitToolResult(emit, {
    id: searchId,
    agent: "researcher",
    toolCallId: searchTool,
    content: JSON.stringify(results),
  });
  emitFinish(emit, { id: searchId, agent: "researcher" });

  // crawl_tool activity
  const crawlId = `researcher-${randomUUID()}`;
  const crawlTool = `crawl-${randomUUID()}`;
  emitMessageStart(emit, crawlId, "researcher");
  emitMessageChunk(emit, crawlId, "researcher", "找到几份高价值资料，继续阅读原文。");
  emitToolCalls(emit, {
    id: crawlId,
    agent: "researcher",
    calls: [
      {
        id: crawlTool,
        name: "crawl_tool",
        args: { url: "https://www.anthropic.com/research/building-effective-agents" },
      },
    ],
    streamArgs: false,
  });
  await streamArgs(emit, signal, {
    id: crawlId,
    agent: "researcher",
    toolCallId: crawlTool,
    name: "crawl_tool",
    args: { url: "https://www.anthropic.com/research/building-effective-agents" },
    pace,
  });
  await wait(800);
  emitToolResult(emit, {
    id: crawlId,
    agent: "researcher",
    toolCallId: crawlTool,
    content:
      "The most successful implementations use simple, composable patterns rather than complex frameworks. " +
      "Start with prompt chaining and routing; add orchestration only when the task genuinely requires it. " +
      "Keep evaluation and human checkpoints close to the workflow.",
  });
  emitFinish(emit, { id: crawlId, agent: "researcher" });

  // python_repl_tool activity (coder)
  const codeId = `coder-${randomUUID()}`;
  const codeTool = `python-${randomUUID()}`;
  const code = `import statistics\n\nscores = [0.82, 0.91, 0.77, 0.88, 0.94]\nprint("median", statistics.median(scores))\nprint("p90", sorted(scores)[int(len(scores) * 0.9) - 1])`;
  emitMessageStart(emit, codeId, "coder");
  emitMessageChunk(emit, codeId, "coder", "跑一段小脚本，校验评测分数分布。");
  emitToolCalls(emit, {
    id: codeId,
    agent: "coder",
    calls: [{ id: codeTool, name: "python_repl_tool", args: { code } }],
    streamArgs: false,
  });
  await streamArgs(emit, signal, {
    id: codeId,
    agent: "coder",
    toolCallId: codeTool,
    name: "python_repl_tool",
    args: { code },
    pace,
  });
  await wait(700);
  emitToolResult(emit, {
    id: codeId,
    agent: "coder",
    toolCallId: codeTool,
    content: "median 0.88\np90 0.94",
  });
  emitFinish(emit, { id: codeId, agent: "coder" });

  // Generic MCP tool activity
  const mcpId = `researcher-${randomUUID()}`;
  const mcpTool = `mcp-${randomUUID()}`;
  emitMessageStart(emit, mcpId, "researcher");
  emitMessageChunk(emit, mcpId, "researcher", "再查一下内部知识库中的评测规范。");
  emitToolCalls(emit, {
    id: mcpId,
    agent: "researcher",
    calls: [{ id: mcpTool, name: "mcp__knowledge__lookup", args: { topic: "agent evaluation" } }],
    streamArgs: false,
  });
  await streamArgs(emit, signal, {
    id: mcpId,
    agent: "researcher",
    toolCallId: mcpTool,
    name: "mcp__knowledge__lookup",
    args: { topic: "agent evaluation" },
    pace,
  });
  await wait(650);
  emitToolResult(emit, {
    id: mcpId,
    agent: "researcher",
    toolCallId: mcpTool,
    content: JSON.stringify(
      {
        matches: 2,
        documents: [
          { id: "doc-204", title: "Agent 评测规范 v3", updated: "2026-08-12" },
          { id: "doc-311", title: "检索证据与引用要求", updated: "2026-09-30" },
        ],
      },
      null,
      2,
    ),
  });
  emitFinish(emit, { id: mcpId, agent: "researcher" });

  // Reporter starts — the client must unlock Report and switch tabs here.
  const reportId = `reporter-${randomUUID()}`;
  emitMessageStart(emit, reportId, "reporter");

  if (scenario === "error") {
    const partial = "# AI Agent 产品：2026 年的关键进展\n\n## 结论先行\n\n2026 年的 Agent 产品已经从“能演示”走向“能交付”";
    emitMessageChunk(emit, reportId, "reporter", partial);
    await wait(500);
    if (!signal.aborted) {
      emit("error", { id: reportId, agent: "reporter", message: "模拟错误：报告模型超时" });
      emitFinish(emit, { id: reportId, agent: "reporter", finishReason: "error" });
    }
    return;
  }

  for (let offset = 0; offset < REPORT.length; offset += 26) {
    if (signal.aborted) return;
    emitMessageChunk(emit, reportId, "reporter", REPORT.slice(offset, offset + 26));
    await wait(24);
  }
  if (!signal.aborted) emitFinish(emit, { id: reportId, agent: "reporter" });
}
