# dsh-dev-wrapped 开发提示词 v2（已按真实数据实测修订）

> 本提示词在 v1（同目录 dsh-dev-wrapped-prompt.md）基础上修订，所有数据格式均已在真实 ~/.dsh/sessions 数据（4 个 workspace、22 个会话文件）上解压实测验证。两版冲突时以本版为准。
> 开发中如遇与本描述不符的真实数据，先报告差异，不要静默猜测。

## 一、项目概述

- **项目名**：`dsh-dev-wrapped`
- **项目路径**：`D:\project1\dsh-dev-wrapped`（目录已存在，内含 `.gitignore`，其余文件均需新建）
- **定位**：DeepSeek Harness (DSH) 开发者使用报告——类 Spotify Wrapped，统计与 AI 结对编程的行为，生成可分享报告卡片
- **技术栈**：TypeScript + Node.js (>=18)，ESM（"type":"module"），strict 模式，pnpm，测试用 vitest
- **v1 交付物**：CLI（`npx dsh-dev-wrapped`）+ Cordis 插件入口（最小壳）
- **v1 范围**：仅 DSH 数据源；但解析层必须输出统一事件模型 NormalizedEvent，为 v2 接入 Claude Code/Codex 预留（适配器接口见第二节）
- **环境（已验证可用）**：Node v22.16.0、pnpm 11.23.0、zstd CLI v1.5.7

## 二、核心架构：统一事件模型 + 适配器

解析层与统计层解耦。统计层只消费 NormalizedEvent，不感知数据来自哪个 CLI：

```typescript
// 统一事件模型（src/types.ts）
export type NormalizedEvent =
  | { kind: 'session-start'; sessionId: string; createdAt: number; cwd: string; origin: 'main' | 'subagent'; agentPreset?: string }
  | { kind: 'turn-start'; sessionId: string; turn: number; time: number }
  | { kind: 'user-message'; sessionId: string; time: number; text: string; isInjected: boolean } // isInjected: <system-reminder> 等注入内容
  | { kind: 'assistant-message'; sessionId: string; time: number; model?: string; textLength: number; usage?: { input: number; output: number } }
  | { kind: 'tool-call'; sessionId: string; turn: number; step: number; callId: string; name: string; args: Record<string, unknown>; time: number }
  | { kind: 'tool-result'; sessionId: string; callId: string; isError: boolean; time: number }

// 适配器接口（v2 接 Claude Code 时新增实现即可，统计/报告层零改动）
export interface SessionAdapter {
  readonly id: string // 'dsh' | 'claude-code' | ...
  scan(rootDir: string): Promise<RawSessionFile[]>
  parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void>
}
export interface RawSessionFile { filePath: string; sessionId: string; workspaceDir: string }
```

DSH 适配器内部：流式解压 → 逐行 JSON → 映射为上述事件。

---

## 三、DSH 会话数据格式（全部实测验证）

### 3.1 目录结构

```
$DSH_HOME/sessions/<workspace-encoded>/<session-dir>/session.jsonl.zstd
```

- `$DSH_HOME` 默认 `~/.dsh`（Windows：`C:\Users\<用户名>\.dsh`）
- `<session-dir>` 有两种：
  - `session-<uuid>`：主会话
  - 裸 UUID（不带前缀）：子代理会话，session 头含 "origin":"subagent"、"parentSession"、"delegationDepth":1
- ⚠️ **workspace 目录名不可解码出可靠路径**：连字符有歧义（`--D-project-AI-Agent--` 无法区分 `-` 与 `\`）。真实工作目录一律取 session 头的 `cwd` 字段，禁止实现目录名解码
- 真实数据现状：4 个 workspace、14 个 `session-` 前缀目录 + 8 个裸 UUID 目录；主/子代理的最终判定以 session 头 `origin` 字段为准

### 3.2 文件格式

- zstd 压缩（magic bytes `28 B5 2F FD`），内容 JSONL，每行一个 JSON 对象
- 实测：压缩后 36KB~1.9MB，解压后单文件 4~6600 行（数 MB），必须流式处理

### 3.3 事件结构

通用结构（session 头除外，其字段在顶层）：

```json
{"type":"...","seq":N,"time":epoch_ms,"data":{...}}
```

统计所需的关键类型与**真实字段路径**：

| type | 关键字段（真实路径） | 用途 |
|---|---|---|
| `session` | 顶层 `id` / `createdAt`(epoch ms) / `cwd` / `agentPreset` / `origin?` / `parentSession?` / `delegationDepth?` | 会话元信息；判断主/子代理 |
| `turn/start` `turn/end` | `data.turn`（从 1 递增） | 轮次计数 |
| `tool/call` | `data.name`、**`data.arguments`（JSON 字符串，需二次 parse；不是 args！）**、`data.turn`、`data.step`、`data.callId`、`time` | 工具统计、文件路径提取 |
| `tool/result` | `data.message.content[0].content[0].isError`（深层嵌套，不在顶层）、`data.message.source.callId` | 错误率统计 |
| `user/message` | `data.content[]`（`{type:"text",text}`） | 用户消息数；**须过滤 `<system-reminder>` 注入** |
| `assistant/message` | `data.message.content[]`（type 为 reasoning/text/tool-call）、`data.message.source.model`、`data.usage?`（真实 token 用量） | 回复统计、token |
| `step/start` `step/end` | `data.turn` / `data.step` | 任务复杂度（步骤数） |

可安全忽略的类型（流式块与杂项，实测出现过）：`reasoning-chunks`、`assistant/chunk`、`tool-call-chunks`、`text-chunks`、`session/title`、`session/title-llm-request`、`session/end-seed`、`todo/write`、`agent/inbox/spliced`、`permission/preset`、`sandbox/mode`、`approval/policy`、`agent-preset/selected`、`request/header`、`request/context`

### 3.4 实测样例（节选自真实数据，以此为准）

```json
{"type":"session","version":0,"id":"session-1ad38389-c7e8-4a0b-b2e9-1bcca8de87c3","createdAt":1786893291897,"cwd":"D:\\project\\AI-Agent","delegationDepth":0,"agentPreset":"standard"}
{"type":"turn/start","seq":5,"time":1786870765446,"data":{"turn":1}}
{"type":"tool/call","seq":318,"time":1786872755736,"data":{"turn":2,"step":1,"callId":"call_00_q15O9X4m2QF1LewVO3O03217","name":"pwsh","arguments":"{\"command\": \"Get-ChildItem ...\", \"description\": \"List project root directory\"}"}}
{"type":"tool/result","seq":319,"time":1786872756285,"data":{"turn":2,"step":1,"message":{"source":{"kind":"tool","callId":"call_00_q15O9X4m2QF1LewVO3O03217"},"content":[{"type":"tool-result","toolCallId":"call_00_...","content":[{"type":"text","text":"..."}],"isError":false}],"role":"user","id":"..."},"surfaceOp":"append"}}
{"type":"user/message","seq":9,"time":1786870765546,"data":{"content":[{"type":"text","text":"<system-reminder>...注入的 AGENTS.md 内容...</text>"}]}}
{"type":"assistant/message","seq":1311,"time":1786872774670,"data":{"turn":2,"step":5,"message":{"role":"assistant","content":[{"type":"reasoning","text":"..."},{"type":"text","text":"这是一个 AI 训练平台项目。"},{"type":"tool-call","id":"call_00_xxx","name":"read","arguments":"{\"file_path\": \"D:\\\\编程学习\\\\毕设\\\\技术架构文档.md\"}"}],"source":{"kind":"model","provider":"deepseek-official","model":"deepseek-v4-pro"},"id":"..."},"usage":{...}}}
```

子代理会话头样例（注意目录名是裸 UUID，无 session- 前缀）：

```json
{"type":"session","version":0,"id":"0389dbce-79ab-407f-9bde-3953ec92e2b8","createdAt":1786870395003,"cwd":"D:\\编程学习\\毕设","parentSession":"session-39fd9b41-6260-497b-98f9-136881ef7d5e","origin":"subagent","delegationDepth":1,"agentPreset":"cordis"}
```

### 3.5 工具分类映射

DSH 实测出现过的工具名：`read` `write` `edit` `glob` `grep` `pwsh` `subagent` `web_search` `skill` `todo_write` `ask_user_question` `read_image` 等（`bash` 未实测但保留映射）：

```typescript
const TOOL_CATEGORIES: Record<string, string> = {
  read: '📖 文件操作', write: '✏️ 代码产出', edit: '✏️ 代码产出',
  glob: '🔍 文件搜索', grep: '🔍 内容搜索',
  bash: '🖥️ 命令执行', pwsh: '🖥️ 命令执行',
  subagent: '🤖 代理委派', web_search: '🌐 信息检索',
  ask_user_question: '💬 人机交互', todo_write: '📋 任务管理',
  skill: '🧠 技能加载', read_image: '🖼️ 多媒体', describe_image: '🖼️ 多媒体',
  browser_navigate: '🌐 浏览器', browser_click: '🌐 浏览器', browser_snapshot: '🌐 浏览器',
}
// 未知工具归入 '📦 其他'
```

### 3.6 元数据存储 `$DSH_HOME/storages/`（实测验证，来自另一调研会话）

**workspace.json**（约 2.7KB，小文件直接读取）——项目路径与 session 的官方映射：

```json
{
  "tables": {
    "workspaces": {
      "<workspace-id>": {
        "path": "D:\\编程学习\\毕设",
        "title": "毕设",
        "sessionIds": ["session-39fd9b41-...", "..."]
      }
    }
  },
  "global": { "initialized": ..., "workspaceIds": [...], "archivedSessionIds": ["session-8cfca1c1-...", ...] }
}
```

- `sessionIds` 只含主会话（实测 14 个 = 磁盘 session- 前缀目录数），不含子代理
- `global.archivedSessionIds`（实测 3 个）归档会话磁盘上仍在，**磁盘目录扫描天然包含归档会话，无需特殊处理**
- 用途：`path → title` 映射（报告展示「毕设」比展示路径更友好）；sessionIds 可用于交叉校验扫描完整性。注意存在 sessions=0 的空 workspace（如 dsh-code-coverage），报告的工作目录列表以实际有会话数据的为准

**session_projcache.json**（实测 4.4MB）——每 session 元数据缓存：

```json
{ "tables": { "sessions": { "<session-id>": {
    "identity": { "createdAt": 1786866578426, "cwd": "D:\\编程学习\\毕设" },
    "rows": { "sessionStats": { "val": { "turns": 11, "steps": 93, "llmMs": 1627155, "decodeTokens": 47756, ... } },
              "title": { ... } } } } } }
```

- **v1 不用它**：所有数据 session.jsonl 里都有，解析 4.4MB 缓存的收益不抵成本；仅当 v2 需要加速全量扫描时再评估。token 统计仍以 `assistant/message` 的 `data.usage` 为准（抽样中 sessionStats 只有 decodeTokens，无完整 input/output 结构）
- 若该文件缺失或损坏，忽略即可，不影响任何功能

---

## 四、统计口径（已确认的产品决策）

1. **子代理会话默认排除**。`--include-subagents` 打开时：子代理的 tool-call/tool-result 并入总工具统计，但不计入会话总数、不参与 topSessions
2. 工作目录取 session 头 `cwd` 字段
3. `--since` / `--until` 接受 `YYYY-MM-DD`，按本地时区解释为该日 00:00:00（until 含当天），过滤基准是 session 的 `createdAt`
4. token：assistant/message 有 `data.usage` 就累加真实值；缺失时报告该字段为 null，**禁止用"4字符/token"估算**
5. 用户消息数：过滤以 `<system-reminder>` 开头的注入内容
6. 文件写入无法可靠区分新建/覆写时，只展示 read/write/edit 去重文件数，不强行拆分"创建/编辑"（诚实原则）

## 五、报告数据结构（v2 修订版）

```typescript
export interface DevWrappedReport {
  generatedAt: number
  dshHome: string
  adapterId: string                    // 'dsh'
  timeRange: { start: number; end: number; days: number }
  overview: {
    totalSessions: number              // 主会话数（不含子代理）
    totalTurns: number
    totalToolCalls: number
    totalUserMessages: number          // 已过滤注入
    activeDays: number
    tokens: { input: number; output: number } | null  // 真实值或 null
  }
  fileOps: {
    filesRead: number                  // read 工具 file_path 去重计数
    filesWritten: number               // write/edit file_path 去重计数
    topFileExtensions: Array<{ ext: string; count: number }>  // 从 read/write/edit 的 file_path 提取扩展名
  }
  toolUsage: Array<{ name: string; count: number; category: string }>
  timeline: {
    hourlyActivity: number[]           // 长度 24，tool/call 按小时分布
    dailyActivity: Array<{ date: string; sessions: number; toolCalls: number }>
    peakHour: number | null
    peakDay: string | null
  }
  highlights: {
    longestSession: { id: string; turns: number; toolCalls: number; durationMs: number; workspace: string } | null
    mostComplexTask: { sessionId: string; totalSteps: number; uniqueTools: string[] } | null
    favoriteTool: string | null
    favoriteWorkspace: string | null   // toolCalls 最多的 cwd
  }
  topSessions: Array<{ id: string; workspace: string; createdAt: number; turns: number; toolCalls: number; topTools: string[] }>
}
```

## 六、项目结构

```
dsh-dev-wrapped/
├── package.json / tsconfig.json / LICENSE(MIT) / .gitignore(已有)
├── README.md                 # 中文
├── bin/dsh-dev-wrapped.mjs   # CLI 入口（#!/usr/bin/env node）
├── src/
│   ├── index.ts              # Cordis 插件壳 + 库导出
│   ├── cli.ts                # CLI 主逻辑（参数解析、进度输出）
│   ├── types.ts              # NormalizedEvent / 适配器 / 报告类型
│   ├── adapters/
│   │   └── dsh.ts            # DSH 会话适配器（扫描 + 解析映射）
│   ├── parser/
│   │   ├── zstd.ts           # 流式解压（CLI 优先 / fzstd fallback）
│   │   └── jsonl.ts          # 逐行安全解析
│   ├── stats/
│   │   └── index.ts          # 从 NormalizedEvent 聚合报告（可拆多文件）
│   └── report/
│       ├── json.ts           # 报告 JSON 输出
│       └── html.ts           # HTML 卡片生成（模板字符串，纯 CSS）
├── __tests__/                # vitest 单测
└── dist/                     # tsc 输出（gitignore）
```

---

## 七、核心实现要求

### 7.1 zstd 流式解压

- 优先 `spawn('zstd', ['-d', '-c', filePath])`，stdout 用 readline 逐行消费；**禁止 execFileSync 全量读入**
- zstd CLI 不存在（ENOENT）或退出非 0 → 动态 `import('fzstd')` fallback（fzstd 放 optionalDependencies；import 失败时打印"请安装 zstd 或 npm i fzstd"后以非 0 退出）
- fzstd 路径允许一次性解压（实测明文最大十几 MB，可接受），但 CLI 路径必须流式

### 7.2 JSONL 解析

- 逐行 `JSON.parse`；单行失败 → stderr 警告并跳过；整个文件失败（zstd 损坏等）→ 警告并跳过该会话，不中断全局
- `tool/call` 的 `data.arguments` 是 JSON 字符串，需二次 parse；失败则 args 记为 `{}`

### 7.3 扫描

- 遍历 sessions/<workspace>/<session-dir>/，凡含 `session.jsonl.zstd` 的目录都收集
- 读首行 session 头，`origin === 'subagent'`（或 delegationDepth >= 1）判定为子代理；目录名前缀仅作辅助
- 主/子代理都解析；统计阶段按第四节口径决定是否并入

### 7.4 HTML 报告卡片

- 单 HTML 文件、零外部依赖、深色蓝紫渐变背景、系统中文字体栈
- 布局：标题 + 时间范围 → 4 个核心大数字（会话/轮次/工具调用/活跃天数）→ 工具排行（纯 CSS 横向条形图，TOP8）→ 24h 活跃分布（纯 CSS 方格或柱）→ 亮点卡片（最爱工具/最长会话/最复杂任务/最爱项目）→ 底部署名
- 响应式，手机/桌面截图均美观；数字用 toLocaleString()

### 7.5 CLI

```
用法: dsh-dev-wrapped [选项]
  --dsh-home <path>        DSH 数据目录（默认 ~/.dsh）
  --output <dir>           输出目录（默认 ./reports）
  --json                   只输出 JSON，不生成 HTML
  --since <YYYY-MM-DD>     起始日期（含），按会话 createdAt 本地时区过滤
  --until <YYYY-MM-DD>     结束日期（含）
  --include-subagents      并入子代理会话的工具调用统计
  --help / -h
```

终端输出参考样式：

```
🔍 扫描 DSH 会话数据...
📂 发现 14 个主会话（另有 8 个子代理会话，默认排除），4 个工作目录
⏳ 解析中...
📊 生成报告...
═══════════════════════════════════════
  DSH Dev Wrapped
  2026-08-10 → 2026-08-25 (16 天)
═══════════════════════════════════════
  会话总数      14
  对话轮数      ...
  工具调用      ...
  活跃天数      ...
  TOP 5 工具    ...
📄 报告已保存: ./reports/dsh-dev-wrapped-YYYY-MM-DD.html
📋 JSON 数据:   ./reports/dsh-dev-wrapped-YYYY-MM-DD.json
```

### 7.6 Cordis 插件壳

```typescript
// src/index.ts
export const name = 'dsh-dev-wrapped'
export function apply(ctx: unknown) {
  // 预留：注册 devWrapped 服务；v1 保持最小实现
}
```

- **不安装任何 `@deepseek-ai/*` 私有包**（公开 npm 拉不到，会卡死 install）；ctx 用 unknown 或本地 declare module，保证 tsc 通过

## 八、开发注意事项

- 所有代码注释中文；ESM；TS strict；无外部运行时依赖（fzstd 可选依赖除外）
- Windows 兼容：路径一律 node:path；spawn 处理 ENOENT；不要硬编码 /
- 性能：流式逐行；22 个会话文件全量解析目标 < 10 秒
- 错误处理：任何单文件/单行失败不得中断整体
- **不要做**：前端 Client 插件、图表库（D3/Chart.js）、React、token 估算、workspace 目录名解码

## 九、验证方法（按顺序执行）

1. `pnpm install && pnpm build` 编译通过
2. `node bin/dsh-dev-wrapped.mjs --dsh-home C:\Users\lrx1lx1\.dsh`：预期识别 4 个 workspace、14 个主会话 + 8 个子代理（默认排除）；核对工作目录显示为 D:\project\AI-Agent、D:\编程学习\毕设 等（来自 session 头 cwd，不是目录名）
3. 加 `--include-subagents` 后工具调用总数应明显变大
4. 生成的 HTML 用浏览器打开，检查布局与数字一致性
5. 边界：--dsh-home 指向空目录 → 友好提示、退出码 0；把一个 .zstd 复制到临时目录并截断 → 警告但不崩溃（不要改动原文件）
6. `pnpm test`：至少覆盖 jsonl 逐行解析、arguments 二次解析、subagent 识别、日期过滤、统计聚合

## 十、开发顺序

骨架+类型 → zstd/jsonl 解析 → 扫描+DSH 适配器 → 统计聚合 → JSON/HTML 报告 → CLI → 单测+中文 README。
每完成一步用真实数据验证，再进下一步。全部完成后询问用户是否需要 git init / 提交，不要自行提交。
