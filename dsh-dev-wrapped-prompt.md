# dsh-dev-wrapped 插件开发提示词

> 本提示词包含所有技术调研结果和开发要求，请严格按照以下规范开发。
> ⚠️ 本版已被 v2（dsh-dev-wrapped-prompt-v2.md，按真实数据实测修订）取代，仅作历史调研原稿保留。两版冲突时以 v2 为准。

---

## 一、项目概述

**项目名**：`dsh-dev-wrapped`
**定位**：DeepSeek Harness (DSH) 开发者专属使用报告插件——类 Spotify Wrapped，统计你和 AI 合作写代码的成果，生成可分享的开发者报告卡片。
**技术栈**：TypeScript + Node.js
**包管理**：pnpm
**目标**：npm 发布 + DSH 插件安装 + CLI 独立运行

---

## 二、DSH 插件开发规范（已验证）

### 2.1 插件加载机制

DSH 插件基于 **Cordis** 框架，一切皆插件。插件有两种加载方式：

**方式一：npm 包安装（推荐）**
```bash
dsh plugin --profile web add "github:owner/repo#ref"
# 或
dsh plugin --profile web add dsh-dev-wrapped
```

**方式二：本地路径加载（开发调试用）**
```yaml
# my-plugin.yml
- insert:
    - id: dev-wrapped
      name: '/绝对路径/dsh-dev-wrapped/index.js'
```
然后：
```bash
dsh --profile headless --patch ./my-plugin.yml "任务"
```

### 2.2 插件 package.json 规范

```json
{
  "name": "dsh-dev-wrapped",
  "description": "Developer Wrapped for DeepSeek Harness — your coding journey with AI, visualized.",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "dsh-dev-wrapped": "./bin/dsh-dev-wrapped.mjs"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    }
  },
  "files": [
    "dist/",
    "bin/",
    "assets/"
  ],
  "keywords": ["dsh-plugin", "deepseek-harness", "developer-report", "wrapped"],
  "license": "MIT",
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-session": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-session-projection": "^0.1.0-rc.6"
  }
}
```

### 2.3 Cordis 插件入口规范

```typescript
// src/index.ts
import { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-dev-wrapped'
export const inject = ['sessions', 'sessionProjections'] as const

export function apply(ctx: Context) {
  // 注册服务
  ctx.provide('devWrapped', null)
  // ... 插件逻辑
}
```

**关键点**：
- `name`：插件标识符，全局唯一
- `inject`：声明依赖的服务
- `apply(ctx)`：插件激活时调用，ctx 是 Cordis 上下文

### 2.4 前端 Client 插件规范

前端插件通过 `window.__ModuleLoader__.load()` 注册：

```javascript
window.__ModuleLoader__.load({
  id: "dsh-dev-wrapped",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    // ... 前端代码（React 组件）
    const { jsx } = require("react/jsx-runtime");
    // ... 注册 UI slot
  }
});
```
---

## 三、DSH 会话数据格式（已验证）

### 3.1 数据位置

```
$DSH_HOME/sessions/<workspace-encoded>/<session-id>/
  └── session.jsonl.zstd    # zstd 压缩的 JSONL 日志
```

- `$DSH_HOME` 默认为 `~/.dsh`（Windows: `C:\Users\<username>\.dsh`）
- `<workspace-encoded>` 是工作目录路径的编码，例如：
  - `--D-project-AI-Agent--` → `D:\project\AI-Agent`
  - `--D-~7F16~7A0B~5B66~4E60-~6BD5~8BBE--` → UTF-8 编码的中文路径
- `<session-id>` 格式：`session-<uuid>`

### 3.2 文件格式

- **压缩**：zstd 压缩（magic bytes: `28 B5 2F FD`）
- **内容**：JSONL（每行一个 JSON 对象）
- **大小**：典型会话 100KB~2MB（压缩前可达数 MB）

### 3.3 事件类型（已验证的完整类型列表）

每行 JSON 的结构：`{"type":"xxx","seq":N,"time":epoch_ms,"data":{...}}`

| 事件类型 | 说明 | 关键字段 |
|----------|------|----------|
| `session` | 会话头（第一行） | `id`, `createdAt`, `cwd`, `agentPreset` |
| `permission/preset` | 权限预设 | `preset`（如 `workspace-write`） |
| `sandbox/mode` | 沙箱模式 | `mode` |
| `approval/policy` | 审批策略 | `policy` |
| `agent-preset/selected` | 选定的 agent 预设 | `agentPreset` |
| `step/start` | 步骤开始 | 时间戳 |
| `step/end` | 步骤结束 | 时间戳 |
| `tool/call` | 工具调用 | `name`（工具名）, `args`（参数，JSON 字符串） |
| `tool/result` | 工具结果 | `content`（结果内容）, `isError` |
| `assistant/message` | AI 回复消息 | 消息内容 |
| `user/message` | 用户消息 | 消息内容 |
| `turn/start` | 对话轮次开始 | 时间戳 |
| `turn/end` | 对话轮次结束 | 时间戳 |
| `request/header` | LLM 请求头 | token 用量信息 |
| `request/context` | 请求上下文 | 上下文大小 |

### 3.4 工具名称映射（DSH 内置工具）

以下是 DSH 中 `tool/call` 的 `name` 字段可能的值：

| 工具名 | 功能 | 统计归类 |
|--------|------|----------|
| `read` | 读取文件 | 📖 文件操作 |
| `write` | 写入文件 | ✏️ 代码产出 |
| `edit` | 编辑文件 | ✏️ 代码产出 |
| `glob` | 文件搜索 | 🔍 文件操作 |
| `grep` | 内容搜索 | 🔍 文件操作 |
| `bash` / `pwsh` | 执行命令 | 🖥️ 命令执行 |
| `subagent` | 子代理 | 🤖 委派任务 |
| `web_search` | 网络搜索 | 🔍 信息检索 |
| `ask_user_question` | 向用户提问 | 💬 交互 |
| `todo_write` | 任务管理 | 📋 任务管理 |
| `skill` | 加载技能 | 🧠 技能 |
| `read_image` / `describe_image` | 图片读取 | 🖼️ 多媒体 |

### 3.5 会话目录示例（已验证的真实数据）

```
~/.dsh/sessions/
├── --D-project-AI-Agent--/
│   ├── session-abc123/
│   │   └── session.jsonl.zstd (约 500KB)
│   └── session-def456/
│       └── session.jsonl.zstd (约 200KB)
├── --D-WebCode-project--/
│   ├── session-ghi789/
│   │   └── session.jsonl.zstd (约 1MB)
│   └── session-jkl012/
│       └── session.jsonl.zstd (约 300KB)
└── --D-~7F16~7A0B~5B66~4E60-~6BD5~8BBE--/
    ├── session-mno345/
    │   └── session.jsonl.zstd (约 500KB)
    └── ... (共 6 个会话)
```
---

## 四、统计维度设计

### 4.1 报告数据结构

```typescript
interface DevWrappedReport {
  // 元数据
  generatedAt: number          // 报告生成时间
  dshHome: string              // DSH 数据目录
  timeRange: {
    start: number              // 最早会话时间
    end: number                // 最晚会话时间
    days: number               // 活跃天数
  }

  // 总览
  overview: {
    totalSessions: number      // 会话总数
    totalTurns: number         // 总对话轮数
    totalToolCalls: number     // 总工具调用次数
    totalTokens: number        // 总 token（估算，4字符/token）
    activeDays: number         // 活跃天数
  }

  // 文件操作
  fileOps: {
    filesRead: number          // 读取文件数
    filesCreated: number       // 创建文件数（write 到新路径）
    filesEdited: number        // 编辑文件数
    totalLinesWritten: number  // 写入总行数（估算）
    topFileExtensions: Array<{ ext: string; count: number }>  // 最常操作的文件类型
  }

  // 工具使用
  toolUsage: Array<{
    name: string               // 工具名
    count: number              // 调用次数
    category: string           // 分类（文件操作/命令执行/搜索/交互等）
  }>

  // 时间分布
  hourlyActivity: number[]     // 24小时活动分布（索引0-23，值为调用次数）
  dailyActivity: Array<{       // 每日活动（最近30天）
    date: string               // YYYY-MM-DD
    sessions: number           // 会话数
    toolCalls: number          // 工具调用数
  }>
  peakHour: number             // 最活跃小时
  peakDay: string              // 最活跃日期

  // 亮点
  highlights: {
    longestSession: {
      id: string
      turns: number
      toolCalls: number
      duration: number         // 持续时间（毫秒）
      workspace: string        // 工作目录
    }
    mostComplexTask: {
      sessionId: string
      totalSteps: number
      uniqueTools: string[]    // 使用的独特工具
    }
    favoriteTool: string       // 最爱工具
    favoriteWorkspace: string  // 最爱工作目录
  }

  // 会话列表（按工具调用数排序，取 TOP 10）
  topSessions: Array<{
    id: string
    workspace: string
    createdAt: number
    turns: number
    toolCalls: number
    topTools: string[]         // 该会话最常用的工具
  }>
}
```

### 4.2 工具分类映射

```typescript
const TOOL_CATEGORIES: Record<string, string> = {
  read: '📖 文件操作',
  write: '✏️ 代码产出',
  edit: '✏️ 代码产出',
  glob: '🔍 文件搜索',
  grep: '🔍 内容搜索',
  bash: '🖥️ 命令执行',
  pwsh: '🖥️ 命令执行',
  subagent: '🤖 代理委派',
  web_search: '🌐 信息检索',
  ask_user_question: '💬 人机交互',
  todo_write: '📋 任务管理',
  skill: '🧠 技能加载',
  read_image: '🖼️ 多媒体',
  describe_image: '🖼️ 多媒体',
  browser_navigate: '🌐 浏览器',
  browser_click: '🌐 浏览器',
  browser_snapshot: '🌐 浏览器',
}
```
---

## 五、项目结构要求

```
dsh-dev-wrapped/
├── package.json
├── tsconfig.json
├── pnpm-lock.yaml
├── .gitignore
├── LICENSE                  # MIT
├── README.md                # 中文文档
├── bin/
│   └── dsh-dev-wrapped.mjs  # CLI 入口
├── src/
│   ├── index.ts             # Cordis 插件入口
│   ├── scanner.ts           # 扫描 ~/.dsh/sessions/ 目录
│   ├── parser.ts            # zstd 解压 + JSONL 解析
│   ├── stats/
│   │   ├── index.ts         # 统计聚合入口
│   │   ├── file-ops.ts      # 文件操作统计
│   │   ├── code-lines.ts    # 代码行数统计
│   │   ├── tool-usage.ts    # 工具调用统计
│   │   ├── timeline.ts      # 时间分布统计
│   │   └── highlights.ts    # 亮点数据提取
│   ├── report/
│   │   ├── generator.ts     # 生成报告 JSON
│   │   └── card.ts          # 生成 HTML 卡片
│   ├── client/
│   │   └── index.ts         # 浏览器端 UI（可选，后期实现）
│   └── types.ts             # 类型定义
├── assets/
│   └── card-template.html   # 报告卡片 HTML 模板
├── dist/                    # 编译输出（gitignore）
└── __tests__/
    └── parser.test.ts       # 基础测试
```

---

## 六、核心实现要求

### 6.1 zstd 解压（重要）

DSH 的 session.jsonl 使用 **zstd** 压缩。有两种解压方式：

**方式一：调用系统 zstd CLI（推荐，无需额外依赖）**
```typescript
import { execFileSync } from 'node:child_process'

function decompressZstd(filePath: string): string {
  return execFileSync('zstd', ['-d', '-c', filePath], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024 // 50MB 上限
  })
}
```

**方式二：使用 npm 包 `fzstd`（纯 JS，无需系统工具）**
```typescript
import { decompress } from 'fzstd'
import { readFileSync } from 'node:fs'

function decompressZstd(filePath: string): string {
  const compressed = readFileSync(filePath)
  const decompressed = decompress(compressed)
  return new TextDecoder().decode(decompressed)
}
```

建议两种都支持，优先用方式一，方式二作为 fallback。

### 6.2 JSONL 解析

```typescript
interface SessionEvent {
  type: string
  seq?: number
  time?: number
  data?: Record<string, any>
  // session 头特殊字段
  id?: string
  createdAt?: number
  cwd?: string
  agentPreset?: string
  version?: number
  delegationDepth?: number
}

function parseJsonl(content: string): SessionEvent[] {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}
```

### 6.3 会话扫描

```typescript
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface SessionInfo {
  workspace: string          // 工作目录（从 encoded name 解码）
  sessionId: string          // session-<uuid>
  filePath: string           // session.jsonl.zstd 的完整路径
  size: number               // 文件大小（字节）
  mtime: number              // 最后修改时间
}

function scanSessions(dshHome: string): SessionInfo[] {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return []

  const results: SessionInfo[] = []
  const workspaces = readdirSync(sessionsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const ws of workspaces) {
    const wsPath = join(sessionsDir, ws.name)
    const sessions = readdirSync(wsPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('session-'))

    for (const sess of sessions) {
      const jsonlPath = join(wsPath, sess.name, 'session.jsonl.zstd')
      if (existsSync(jsonlPath)) {
        const stat = statSync(jsonlPath)
        results.push({
          workspace: decodeWorkspaceName(ws.name),
          sessionId: sess.name,
          filePath: jsonlPath,
          size: stat.size,
          mtime: stat.mtimeMs
        })
      }
    }
  }
  return results
}

function decodeWorkspaceName(encoded: string): string {
  // 移除首尾的 --
  let name = encoded.replace(/^--|--$/g, '')
  // 将 ~XXXX~ 格式的 UTF-8 编码解码
  name = name.replace(/~([0-9A-Fa-f]{4})~/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
  // 将 - 替换为路径分隔符
  return name.replace(/-/g, '\\')
}
```
### 6.4 HTML 报告卡片要求

生成一张**设计感强、可截图分享**的 HTML 报告卡片，要求：

1. **渐变背景**：深色主题，蓝紫渐变
2. **响应式**：适配手机和桌面截图
3. **内容布局**：
   - 顶部：标题「DSH Dev Wrapped」+ 时间范围
   - 核心数字区：大字体展示会话数、工具调用数、代码行数、活跃天数
   - 工具排行：横向柱状图（纯 CSS 实现，不依赖图表库）
   - 时间热力图：24 小时活跃分布（纯 CSS 方格）
   - 亮点卡片：最爱工具、最长会话、最复杂任务
   - 底部：「由 dsh-dev-wrapped 生成」+ GitHub 链接
4. **零外部依赖**：所有样式内联，单个 HTML 文件可直接打开
5. **中文字体**：使用系统默认中文字体栈

### 6.5 CLI 入口要求

```bash
# 基本用法
npx dsh-dev-wrapped

# 指定 DSH 目录
npx dsh-dev-wrapped --dsh-home ~/.dsh

# 指定输出目录
npx dsh-dev-wrapped --output ./reports

# 只输出 JSON（不生成 HTML）
npx dsh-dev-wrapped --json

# 指定时间范围
npx dsh-dev-wrapped --since 2026-08-01 --until 2026-08-23
```

CLI 输出示例：
```
🔍 Scanning DSH sessions...
📂 Found 11 sessions across 4 workspaces
⏳ Parsing session data...
📊 Generating developer report...

═══════════════════════════════════════
  🐳 DSH Dev Wrapped
  2026-08-16 → 2026-08-23 (8 天)
═══════════════════════════════════════

  📁 会话总数        11
  💬 对话轮数        147
  🔧 工具调用        1,283
  📝 估算代码行数     2,847
  📅 活跃天数         8

  🔧 TOP 5 工具
  ─────────────────────────────
  1. read          423 次  (33.0%)
  2. edit          287 次  (22.4%)
  3. write         198 次  (15.4%)
  4. bash          156 次  (12.2%)
  5. grep          112 次  ( 8.7%)

  📄 报告已保存: ./reports/dsh-dev-wrapped-2026-08-23.html
  📋 JSON 数据:   ./reports/dsh-dev-wrapped-2026-08-23.json

  分享你的报告 → 截图发朋友圈 🎉
```

---

## 七、README.md 要求

中文 README，包含：

1. **项目名 + 一句话描述**
2. **效果预览**（占位截图）
3. **快速安装**
   ```bash
   # DSH 插件安装
   dsh plugin --profile web add "github:你的用户名/dsh-dev-wrapped#main"

   # 或 CLI 独立运行
   npx dsh-dev-wrapped
   ```
4. **功能列表**
5. **技术实现简述**（数据来源、解析方式）
6. **开发指南**（如何本地开发和调试）
7. **贡献指南**
8. **License**

---

## 八、开发注意事项

### 8.1 代码风格
- 所有注释使用**中文**
- 使用 ESM（`"type": "module"`）
- TypeScript strict 模式
- 无外部运行时依赖（除了可选的 `fzstd`）

### 8.2 性能要求
- 会话文件可能很大（压缩前可达数 MB），解析时不要一次性全加载到内存
- 对于大文件，考虑流式处理
- zstd 解压使用 CLI 子进程时，注意 `maxBuffer` 设置

### 8.3 错误处理
- 会话文件可能损坏，解析失败时跳过并警告
- zstd CLI 不存在时，fallback 到 fzstd npm 包
- 会话目录不存在时，给出友好提示

### 8.4 Windows 兼容
- 路径使用 `node:path` 的 `join`，不要硬编码 `/`
- 工作目录编码解码要处理 UTF-8（如 `~7F16~7A0B~` 格式）
- zstd CLI 路径可能不在 PATH 中，给出安装提示

### 8.5 不要做的事情
- 不要依赖 React（纯 HTML 生成报告卡片）
- 不要依赖 D3/Chart.js 等图表库（纯 CSS 实现）
- 不要在 MVP 阶段做前端 Client 插件（先做 CLI）
- 不要解析 token 用量（那是 dsh-token-meter 的事，我们聚焦开发者行为）

---

## 九、验证方法

1. **CLI 测试**：`npx dsh-dev-wrapped --dsh-home C:\Users\lrx1lx1\.dsh` 应该输出统计报告
2. **HTML 卡片**：生成的 HTML 文件用浏览器打开，截图应美观可分享
3. **插件测试**：`dsh plugin --profile web add ./dsh-dev-wrapped` 安装后不报错
4. **边界测试**：空会话目录、损坏文件、超大文件都不应崩溃
