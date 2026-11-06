# AI Search · Research Sidebar

一个带「研究过程侧边栏」的 AI 搜索应用：Agent 拆解问题、检索、阅读、评估信息是否充分，再流式撰写带引用的报告。前端已按 `frontend.md` 的最佳实践升级为 React 18 + TypeScript + Tailwind + Zustand。

## 快速开始

```bash
npm install

# 无 API key 的完整演示（推荐先跑这个）
npm run dev:mock          # 浏览器打开 http://localhost:5173

# 真实检索（需要 .env 中的 METASO_API_KEY 与 Claude 凭证）
npm run dev               # Vite :5173 + API :3000

# 生产构建
npm run build
npm start                 # http://localhost:3000
```

测试与检查：

```bash
npm run lint              # ESLint（TS + React Hooks）
npm run typecheck         # tsc --noEmit
npm test                  # 13 个单元 / 集成测试（含 mock 全流程）
npm run check             # lint + typecheck + test
npm run e2e               # 自动构建 + 启动 mock server + 驱动本机 Chrome
```

`npm run e2e` 依赖本机安装 Chrome/Chromium；也可设置 `CHROME_PATH`。截图输出到 `screenshots/`。

## 功能对照

| 规格 | 实现 |
| --- | --- |
| 桌面双栏，右栏 0 → `clamp(360px,40vw,960px)`，300ms ease-out | `ResearchPanel.tsx` + Tailwind 宽度过渡 |
| 移动端 <768px 改为 Drawer，`calc(100vw - 16px)` | 固定定位 + 背景遮罩 |
| Activities / Report 两个 Tab，Report 出现前禁用 | `ResearchTabs.tsx`，Radix Tabs + `forceMount` + `hidden` |
| Reporter 首次出现自动切到 Report，之后尊重手动切换 | `src/core/research/events.ts` 生命周期 |
| web_search：query + 6 个骨架卡片 → 页面/图片卡片 | `activity/WebSearchActivity.tsx` |
| crawl / python / MCP 专用卡片 | `activity/CrawlActivity.tsx` / `PythonActivity.tsx` / `McpActivity.tsx` |
| 报告流式渲染、贴底跟随、回到最新 | `ReportView.tsx` + `ScrollFollow.tsx` |
| 完成后复制 / 下载 / 编辑写回 | `ReportView.tsx` |
| 刷新重建状态、断线续传 | localStorage 持久化 + 服务端事件日志回放 |
| XSS 防护 | `react-markdown` 默认不解析 raw HTML + `rehype-sanitize` + URL 协议白名单 |
| 减少动效 | `prefers-reduced-motion` 全局降级 |

## SSE 事件协议

`GET /api/research?q=...&thread_id=...`

每条事件包含 `seq / run_id / thread_id`，主消息事件额外包含 `id / agent / role`。浏览器断线重连时可用 `Last-Event-ID`，刷新恢复时客户端传 `resume=1&last_event_id=<seq>&run_id=<run>`。

```text
event: message_start      data: { id, agent, role }
event: message_chunk      data: { id, agent, role, content }
event: tool_calls         data: { id, tool_calls: [{ id, index, name, args }] }
event: tool_call_chunks   data: { id, tool_call_chunks: [{ id, index, name, args: "<json fragment>" }] }
event: tool_call_result   data: { id, tool_call_id, content }
event: finish             data: { id, agent, role, finish_reason }
event: interrupt          data: { id, options }
event: error              data: { message, code?, id? }
event: done               data: {}
```

服务端按 thread 保存一份有上限的事件日志：新问题会中止同 thread 的旧 run；重连/刷新只回放缺失事件，不会重复调用 LLM。真正的搜索实现见 `lib/research.js`，无 key 的演示流见 `lib/mock.js`。

## 状态机与文件结构

```text
src/
  core/research/
    types.ts            AgentMessage / ToolCall / ResearchEvent
    events.ts           纯 reducer：事件合并、seq 幂等、研究生命周期、Tab 状态机
    store.ts            Zustand store + 派生 selector
    persistence.ts      localStorage 持久化（150ms 防抖 + pagehide flush）
    sources.ts          引用编号 → 来源链接、代码块保护
    lru.ts              page url → title 的 LRU（max 100）
  components/
    Chat.tsx            左侧对话、规划消息、状态卡片、输入框
    research/
      ResearchPanel.tsx 侧边栏壳 + 移动端 Drawer
      ResearchTabs.tsx  Activities / Report
      ActivitiesList.tsx
      activity/…        四种工具卡片
      ReportView.tsx    流式报告、编辑、复制、下载
      ScrollFollow.tsx  贴底跟随
  hooks/
    useResearchStream.ts  EventSource 连接、重连、恢复
    useThrottledValue.ts  Markdown 渲染节流（≥50ms）
```

研究生命周期（与 `frontend.md` §5/§6 一致）：

1. 首条 `researcher / coder / reporter` 消息创建 research，向前找最近的 planner 作为计划；
2. 后续同类消息按 id 去重追加到 Activities；
3. reporter 首次出现写入 `reportId` 并自动切到 Report；
4. reporter 流结束（`finish`）后 `ongoingResearchId = null`；
5. Report 只能在 `hasReport` 为真时激活；用户手动切换后不会被 token 抢回。

## 实现取舍

- **同一消息多个 toolCalls**：全部按顺序渲染（规格默认），没有只渲染第一个。
- **tool args**：`tool_calls` 同时带一份已解析 args 以便立刻显示搜索词；`tool_call_chunks` 仍会分片流式传输，结束时以拼接后的 JSON 为准。mock 中两者都覆盖。
- **旧版页面**：`public/` 中的原生页面与 `/api/search` 保留，`dist/` 存在时优先服务新版 React；旧页面仅作为未构建时的 fallback。
- **E2E**：使用 `playwright-core` 驱动本机 Chrome，不额外下载浏览器；覆盖骨架屏、自动切 Report、贴底/回到最新、工具卡片、编辑/下载、关闭重开、刷新重建、流中断点续传、移动端 Drawer。
- **持久化中断标记**：刷新后若服务端 run 已过期，会收到 `session_expired`，保留已收到的 Activities / 报告内容并展示重试入口，不会清空。

## 后端

- `server.js`：静态资源、旧接口、run manager、SSE 回放、SPA fallback。
- `lib/research.js`：规划 → 并行检索 → 评估 → 不足则重规划（最多 3 轮）→ 流式报告。
- `lib/mock.js`：无需密钥的 fixture，包含 web_search / crawl / python / MCP 与错误场景（`?scenario=error`、`?scenario=empty`）。
- `lib/pipeline.js`：旧版逐步事件管线，保留给旧页面。
