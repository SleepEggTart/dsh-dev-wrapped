# dsh-dev-wrapped

DSH（DeepSeek Harness）开发者年度报告 —— 类 Spotify Wrapped 的编程回顾，统计你与 AI 结对编程的行为，生成可分享的报告卡片。

```
扫描 ~/.dsh/sessions（zstd 压缩 JSONL）
        ↓
统一事件模型 NormalizedEvent
        ↓
聚合统计
        ↓
JSON 数据 + 深色渐变 HTML 报告卡片
```

## 特性

- **100% 本地解析**：数据不出本机，不依赖任何云服务
- **零运行时依赖**：优先调用系统 `zstd` CLI 流式解压；未安装时自动回退可选依赖 `fzstd`
- **诚实统计**：token 只采用模型返回的真实 `usage`，缺失即报告 `null`，禁止估算
- **适配器架构**：解析层与统计层通过 `NormalizedEvent` 解耦，支持 DSH 和 Claude Code 等多种数据源
- **逐屏叙事报告**：Spotify Wrapped 风格 scroll-snap 逐屏回顾（默认），`--compact` 切换紧凑单页
- **统计深化**：工具错误率排行、深夜（0-6 点）编码占比、工作日/周末分布、模型分布、DSH agentPreset 分布
- **成就徽章**：11 枚游戏化徽章（深夜代码手 / 夜猫子 / 工具收藏家 / 周末战士 / 马拉松选手……），基于统计自动解锁
- **年度对比**：`--compare` 对比今年与去年（会话 / 轮次 / 工具调用 / 活跃天数 / Token），展示成长曲线
- **多语言**：`--lang en` 输出英文报告卡片，方便海外分享
- **单文件 HTML**：纯 CSS 图表（条形图 / 24h 柱状图），无外部资源，手机与桌面均美观
- **工程完备**：GitHub Actions CI（Node 18/20/22 矩阵）+ changesets 版本管理 + fuzz 容错测试（损坏 zstd / 截断文件 / 垃圾行）

## 快速开始

方式一：DSH 插件安装（推荐）：

```bash
dsh plugin add github:SleepEggTart/dsh-dev-wrapped
dev.wrapped
```

方式二：克隆仓库本地运行（npm 包暂未发布，`npx dsh-dev-wrapped` 暂不可用）：

```bash
git clone https://github.com/SleepEggTart/dsh-dev-wrapped.git
cd dsh-dev-wrapped
pnpm install && pnpm build
node bin/dsh-dev-wrapped.mjs
```

首次运行会自动扫描 `~/.dsh/sessions`，生成 HTML 报告并用浏览器打开。

### zstd（可选优化）

DSH 会话文件使用 zstd 压缩。工具会自动检测：
- ✅ **系统已装 zstd** → 直接使用（推荐，性能最优）
- ✅ **系统未装 zstd** → 自动回退 `fzstd`（Node.js 解压库，无需额外操作）
- ❌ **两者都没有** → CLI 会给出对应平台的一键安装命令

如需手动安装 zstd 以获得最佳性能：

| 平台 | 命令 |
|---|---|
| Windows | `winget install facebook.zstd` |
| macOS | `brew install zstd` |
| Linux | `sudo apt install zstd` |

输出示例：

```
🔍 扫描 DSH 会话数据...
📂 发现 14 个主会话（另有 8 个子代理会话，默认排除），5 个工作目录
⏳ 解析中...
📊 生成报告...
═══════════════════════════════════════
  DSH Dev Wrapped
  2026-08-16 → 2026-08-26（10 天）
═══════════════════════════════════════
  会话总数    18
  对话轮数    162
  工具调用    1,944
  活跃天数    4
  TOP 5 工具  web_search · pwsh · read · ...
📄 报告已保存: reports\dsh-dev-wrapped-2026-08-26.html
📋 JSON 数据:   reports\dsh-dev-wrapped-2026-08-26.json
```

## CLI 选项

```
用法: dsh-dev-wrapped [选项]

选项:
  --adapter <id>           数据源适配器: dsh（默认）/ claude-code / auto（自动检测）
  --dsh-home <path>        DSH 数据目录（默认 ~/.dsh）
  --claude-home <path>     Claude Code 数据目录（默认 ~/.claude）
  --output <dir>           输出目录（默认 ./reports）
  --json                   只输出 JSON，不生成 HTML
  --compact                紧凑单页报告（默认为逐屏滚动叙事模式）
  --year <YYYY>            年度回顾：等价于该年 1-1 ~ 12-31 的日期过滤
  --compare                年度对比：配合 --year（缺省为当前年份），对比该年与上一年
  --lang <zh|en>           报告语言（默认 zh）
  --estimate-cost          按 DeepSeek 单价估算成本（基于真实 token，标注"估算"）
  --since <YYYY-MM-DD>     起始日期（含），按会话 createdAt 本地时区过滤；与 --year 互斥
  --until <YYYY-MM-DD>     结束日期（含）；与 --year 互斥
  --include-subagents      并入子代理会话的工具调用统计
  --help, -h               显示帮助
```

示例：只回顾 2026 年 8 月，并把子代理的调用算进来：

```bash
dsh-dev-wrapped --since 2026-08-01 --until 2026-08-31 --include-subagents
```

示例：扫描 Claude Code 会话数据：

```bash
npx dsh-dev-wrapped --adapter claude-code
```

示例：自动检测数据源（优先 DSH）：

```bash
dsh-dev-wrapped --adapter auto
```

示例：2026 年度回顾 + 成本估算 + 英文卡片：

```bash
dsh-dev-wrapped --year 2026 --estimate-cost --lang en
```

示例：年度对比（2026 vs 2025，上一年无数据时自动跳过）：

```bash
dsh-dev-wrapped --year 2026 --compare
```

## 统计口径

| 口径 | 说明 |
|---|---|
| 子代理 | 默认排除；`--include-subagents` 时其工具调用并入总量，但不计入会话数与热门会话 |
| Token | 只累加 assistant 消息携带的真实 usage；存在缺失即整体置 `null`（禁止估算） |
| 用户消息 | 过滤 `<system-reminder>` 等注入内容后才计数 |
| 工作目录 | 取 session 头 `cwd` 真实路径（目录名不可解码） |
| 主/子代理 | 以 session 头 `origin` 字段为准，`delegationDepth >= 1` 兜底 |
| 日期过滤 | 以会话 `createdAt` 为基准，本地时区，含边界当日 |
| 活跃天数 | 会话创建日 ∪ 工具调用日（跨天 resume 的活动日也计入） |
| 工具错误率 | `tool-result` 的 `isError=true` 按 callId 关联回 `tool-call`；分母为该工具总调用数（含未返回结果的调用） |
| 深夜编码 | 本地时区 0-6 点（含）工具调用占比；无调用时为 `null` |
| 星期分布 | 本地时区周一至周日的工具调用分布 |
| 模型分布 | 按去重后的 assistant 消息条数计（`source.model` 聚合） |
| agentPreset | DSH 主会话的 `agentPreset` 分布；非 DSH 数据源为空数组 |
| 成本估算 | `--estimate-cost` 显式开启时，按 DeepSeek deepseek-chat 公开单价（输入 ¥2/M、输出 ¥8/M）乘以**真实** token 计算；卡片上标注"估算"；token 缺失时跳过 |

## 开发

```bash
pnpm install     # 安装依赖
pnpm build       # TypeScript 编译到 dist/
pnpm test        # vitest 单测（126 个用例，含 fuzz 容错测试）
node bin/dsh-dev-wrapped.mjs   # 本地运行 CLI
```

### 项目结构

```
src/
├── types.ts           # 统一事件模型 NormalizedEvent / SessionAdapter / 报告类型
├── parser/
│   ├── zstd.ts        # zstd 流式解压（CLI 优先 + fzstd 回退）
│   └── jsonl.ts       # JSONL 逐行容错解析 + arguments 二次解析
├── adapters/
│   ├── dsh.ts         # DSH 适配器：扫描 + 事件映射
│   └── claude-code.ts # Claude Code 适配器（~/.claude/projects JSONL）
├── tools.ts           # 工具分类映射（大小写不敏感，多适配器复用）
├── stats/
│   └── index.ts       # 统计聚合（口径收敛于此）
├── report/
│   ├── format.ts      # 数字/时长/token 格式化与 XSS 转义
│   ├── json.ts        # JSON 报告输出
│   ├── html.ts        # compact 紧凑单页卡片（纯 CSS 图表）
│   └── story.ts       # story 逐屏叙事报告（scroll-snap）
├── i18n.ts            # 中英文案表
├── cost.ts            # 成本估算（DeepSeek 公开单价）
├── cli.ts             # CLI 主逻辑（参数解析 / 进度 / 汇总输出）
└── index.ts           # Cordis 插件壳 + 库导出
__tests__/             # vitest 单测（含 fuzz 容错测试）
bin/dsh-dev-wrapped.mjs  # CLI 入口
```

### 库使用

```typescript
import { DshAdapter, aggregate } from 'dsh-dev-wrapped'

const adapter = new DshAdapter()
const files = await adapter.scan('~/.dsh') // 实际使用绝对路径
const events = []
for (const f of files) {
  await adapter.parse(f, (e) => events.push(e))
}
const report = aggregate(events, { includeSubagents: false })
```

## 已知限制

- DSH 处于开发者预览阶段，`~/.dsh/sessions` 数据格式可能随版本演进发生破坏性变更
- 正在写入的会话文件（DSH 运行中）可能读到不完整数据；损坏文件会被警告并跳过
- Windows 下 `zstd` 需在 PATH 中；缺失时自动回退 `fzstd`，若两者均无则 CLI 会输出平台对应的安装命令

## 许可证

MIT
