  你是一名资深前端工程师，擅长 React/TypeScript、实时流式 UI 和 AI Agent 产品交互。
  请在我指定的项目中实现一个「研究过程右侧边栏（Research Sidebar）」。

  【可替换参数】
  - 框架：React 18+ + TypeScript
  - 样式：Tailwind CSS + shadcn/ui（Tabs / ScrollArea / Skeleton / Accordion）
  - 状态：Zustand（也可用 useReducer）
  - 传输：SSE（也可替换为 WebSocket，但事件语义保持一致）
  - Markdown：react-markdown / Streamdown，必须支持流式增量渲染

  ## 1. 目标与用户故事
  当 Agent 开始一次研究任务时，聊天区域右侧自动展开一个可关闭的侧边栏，包含两个 Tab：
  - Activities：默认显示，实时展示 Agent 的调研行为和搜索结果。
  - Report：当 Agent 开始撰写报告时自动切换，流式渲染 Markdown 报告。

  交互顺序必须是：先 Activities，后 Report；Report 在出现之前不可用。

  ## 2. 布局
  - 桌面端：两栏。左栏聊天最小 420px；右栏宽度 `min(75vw, 960px)` 或 `clamp(360px, 40vw, 960px)`。
  - 右栏从 0 展开，300ms ease-out；左栏同步收窄（例如 768px → 538px）。
  - 右栏可关闭；关闭只隐藏 UI，不取消研究。
  - 移动端（<768px）：右栏改为右侧 Drawer / Sheet，宽度 `calc(100vw - 16px)`，不挤压聊天区。
  - 右栏顶部：Tabs + 关闭按钮；Report 与 Activities 的左右顺序按产品文案决定，默认激活 Activities。

  ## 3. 状态模型
  ```ts
  type ResearchId = string;
  type MessageId = string;

  interface ResearchState {
    researchIds: ResearchId[];
    planIdByResearch: Record<ResearchId, MessageId>;
    reportIdByResearch: Record<ResearchId, MessageId>;
    activityIdsByResearch: Record<ResearchId, MessageId[]>;
    ongoingResearchId: ResearchId | null;
    openResearchId: ResearchId | null;
  }

  interface AgentMessage {
    id: string;
    agent: "planner" | "researcher" | "coder" | "reporter" | "other";
    role: "user" | "assistant" | "tool";
    content: string;          // 累积后的完整文本
    isStreaming: boolean;
    toolCalls?: ToolCall[];
  }

  interface ToolCall {
    id: string;
    name: string;             // web_search | crawl_tool | python_repl_tool | ...
    args: Record<string, unknown>;
    result?: string;          // 原始 JSON 或纯文本；undefined = 进行中
  }
  ```

  ## 4. SSE 事件协议
  每个事件格式：`event: <type>\ndata: <json>\n\n`。
  data 至少包含 `id / thread_id / agent / role / finish_reason`。

  - `message_chunk`：`{ content }`，追加到消息 content。
  - `tool_calls`：`{ tool_calls, tool_call_chunks }`，先建立工具调用占位。
  - `tool_call_chunks`：`{ tool_call_chunks: [{ id, index, name, args }] }`；
    同一个 toolCall 的 `args` 是分片字符串，必须按顺序拼接。
  - `tool_call_result`：`{ tool_call_id, content }`，写入对应 ToolCall.result。
  - `interrupt`：`{ options }`，结束当前流并展示选项。
  - 任意事件出现 `finish_reason`：置 `isStreaming = false`；
    若 toolCalls 还留有未解析的 args 分片，用 `JSON.parse(argsChunks.join(""))` 还原。

  规则：只追加、不覆盖；未知事件/字段忽略；重复事件按 id 幂等；
  断线重连按 `Last-Event-ID` / `seq` 续传并去重。

  ## 5. 研究生命周期（必须严格实现）
  1. 收到首条 `agent ∈ { researcher, coder, reporter }` 的消息时：
     - 若 `ongoingResearchId == null`：创建 `researchId = 该消息 id`；
     - 从已有消息中向前找最近一条 `agent === "planner"` 的消息，记为 `planId`；
     - `activityIds = [planId, researchId]`，但渲染时跳过索引 0；
     - `openResearchId = researchId`，展开右栏；
     - `ongoingResearchId = researchId`。
  2. 之后每条 researcher/coder/reporter 消息：按 id 去重追加到 `activityIds`；
     若 `agent === "reporter"`，同时写入 `reportIdByResearch[researchId] = message.id`。
  3. reporter 消息 `isStreaming` 变为 false 时：`ongoingResearchId = null`。
  4. 若 reporter 恰好是本次研究的第一条 activity，仍然允许 Report 立即出现；
     「重置到 Activities」的逻辑只能在 `!hasReport` 时执行。

  ## 6. Tab 状态机
  - 初始 `activeTab = "activities"`。
  - `hasReport = Boolean(reportIdByResearch[researchId])`。
  - `hasReport` 从 false 变 true 时：自动 `setActiveTab("report")`。
  - `researchId` 变化且 `!hasReport` 时：重置为 `"activities"`。
  - Report 触发器 `disabled = !hasReport`。
  - 两个 TabsContent 都使用 `forceMount` + `hidden`（保留滚动位置和已渲染内容），不要条件卸载。
  - 用户手动切换后，除非发生「新研究」或「Report 首次出现」，否则不要自动抢回。

  ## 7. Activities 渲染规格
  - 垂直时间线，按 activityIds 顺序渲染，跳过第 0 条（plan）。
  - 每条 activity：
    - 若 agent 是 researcher/coder 且有文本：渲染 Markdown。
    - 若含 toolCalls：按 id 去重、按顺序渲染专用卡片。
  - 进行中的工具：显示 shimmer/rainbow 文字 + Skeleton。
  - 列表底部若研究仍在进行：显示 Loading 动画。
  - 工具卡片：
    - `web_search`
      - 进行中：`Searching for "<query>"` + 6 个骨架卡片。
      - 完成：解析 result 为 JSON 数组；
        `type === "page"` → favicon + 标题链接，横向换行卡片；
        `type === "image"` → 缩略图卡片；
        新结果逐项 stagger 淡入（100ms 间隔）。
      - 把 page 的 `url → title` 写入 LRU 缓存（max 100），供 crawl 复用。
    - `crawl_tool`
      - `Reading` + favicon + 页面标题（缓存取不到则用 URL）+ 外链。
    - `python_repl_tool`
      - `Running Python code` + 语法高亮代码块，最大高度 400px，可滚动。
    - 其他 / MCP 工具
      - Accordion：标题 `Running <name>()`，展开显示 JSON 结果（语法高亮）。
  - 列表项入场动效：`opacity 0→1, y 24→0, 400ms ease-out`；
    完成后停止 shimmer；尊重 `prefers-reduced-motion`。

  ## 8. Report 渲染规格
  - 内容来自 reporter 消息的 `content`，随 `message_chunk` 逐段追加。
  - `isStreaming` 时：Markdown 开启 `animate`，底部显示 Loading。
  - `!isStreaming && content` 时：切换为可编辑的报告编辑器（或只读 + 编辑开关）；
    编辑写回消息状态，不触发重新请求。
  - 顶部操作区仅在 `hasReport && !isStreaming` 时出现：复制、下载/导出、可选播客。
  - 自动滚动：`autoScrollToBottom = !hasReport || reportStreaming`。
    用户手动上滚时暂停跟随，并显示「回到最新」按钮；滚回底部后恢复跟随。
  - 长报告：Markdown 解析必须节流（≥50ms 或每帧一次），避免每个 token 重排。
  - 安全：渲染前 sanitize；禁止 raw HTML；链接统一
    `target="_blank" rel="noopener noreferrer"` 并校验协议。

  ## 9. 边界与失败
  - 研究失败/中断：保留 Activities；Report 显示错误态与重试，不清空已收到内容。
  - 刷新/重连：从持久化消息恢复 researchId 映射，重建两个 Tab 和滚动位置。
  - 切换会话：Abort 旧流，状态隔离，禁止旧流写入新会话。
  - 关闭侧栏：只关闭 UI；再次出现新 research 时自动重开。
  - `web_search` 返回空数组：显示「未找到结果」，不要无限 Skeleton。
  - Report 先于 Activities：允许，按第 5、6 条规则处理。
  - 同一消息多个 toolCalls：默认全部按顺序渲染；若要与参考实现 1:1 对齐，可只渲染第一个，
    但必须在代码注释中记录这一取舍。

  ## 10. 文件结构建议
  ```
  src/
    core/research/store.ts
    core/research/events.ts
    components/research/ResearchPanel.tsx
    components/research/ResearchTabs.tsx
    components/research/ActivitiesList.tsx
    components/research/activity/WebSearchActivity.tsx
    components/research/activity/CrawlActivity.tsx
    components/research/activity/PythonActivity.tsx
    components/research/activity/McpActivity.tsx
    components/research/ReportView.tsx
    components/research/ScrollFollow.tsx
  ```

  ## 11. 验收标准
  1. 发送研究任务后，右栏自动展开，默认 Activities，Report 标签禁用。
  2. web_search 出现时立即显示 query 和 6 个骨架卡片；结果到达后替换为页面/图片卡片。
  3. reporter 开始输出的瞬间，Report 变为可用并自动切换；报告肉眼可见地流式增长。
  4. 流式期间自动贴底；用户上滚后停止跟随并出现「回到最新」。
  5. 报告完成后可复制/编辑/下载；编辑内容不丢失。
  6. 刷新页面后，Activities/Report 和历史 tab 状态可从持久化数据重建。
  7. 移动端以 Drawer 呈现，不挤压聊天区。
  8. `prefers-reduced-motion` 下关闭非必要动画。
  9. 单元测试覆盖：事件合并幂等、tool args 分片拼接、hasReport 自动切换、
     首条 activity 为 report 的边界；E2E 覆盖完整流式流程。
  10. 无 XSS：搜索标题、URL、MCP 结果均按不可信输入处理。

  ## 12. 输出要求
  - 先输出状态机与事件协议，再输出组件代码；不要省略边界处理。
  - 使用 mock SSE 服务器或 fixture 演示完整流式过程，保证无需真实后端即可验收。
  - 代码通过 typecheck/lint，并给出启动与测试命令。