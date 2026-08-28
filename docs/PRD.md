# dsh-dev-wrapped 产品需求文档（PRD）

> 版本：v1.2.0 ｜ 更新日期：2026-08-28 ｜ 状态：v1.2.0 已发布，持续迭代

## 1. 产品概述

### 1.1 一句话定位

类 Spotify Wrapped 的开发者年度回顾工具：本地解析 DSH 与 Claude Code 会话数据，生成可分享的统计报告卡片，100% 离线，零运行时依赖。

### 1.2 目标用户

- 使用 DSH（DeepSeek Harness）或 Claude Code 的开发者
- 想回顾自己"和 AI 结对编程"的行为数据、并生成可分享内容的用户

### 1.3 核心差异化（竞品调研结论，2026-08-28）

DSH 插件市场 5870 个插件中，"用量/成本/余额仪表盘"是红海（100+ 个），但**跨会话叙事回顾报告**赛道竞品仅 4 个且均不重叠：

| 竞品 | 定位 | 与本产品的区别 |
|---|---|---|
| lanlandeli/dsh-usage-stats (11★) | Token 实时监控面板 | 监控仪表盘 vs 叙事回顾报告 |
| rand0wn/dsh-wrapped (1★) | 单会话 → SVG 分享卡 | 单会话 vs 跨会话全历史 |
| GreenLv/dsh-session-insights (1★) | 工作流复盘（定性证据链） | 复盘方法 vs 统计行为 |
| 988hj7tczd-oss/dsh-receipts (0★) | JSONL → Markdown 账单 | 纯文本账单 vs 视觉叙事 |

**独家能力**：story 逐屏滚动叙事、年度模式、双数据源（DSH + Claude Code）、i18n 分享卡、成就徽章（v1.1.0）、年度对比（v1.1.0）。

**刻意不做的方向（避免撞车）**：
- ❌ 实时用量/余额/成本面板（红海）
- ❌ 单会话分享卡（rand0wn/dsh-wrapped 地盘）
- ❌ 工作流复盘/经验蒸馏（session-insights、memos-code-retrospect 地盘）

## 2. 技术架构

```
解析层（adapters）        统计层（stats）         呈现层（report）
┌─────────────┐          ┌─────────────┐        ┌─────────────┐
│ DshAdapter   │ NormalizedEvent │ aggregate() │ → story 逐屏叙事 │
│ ClaudeCode.. │ ───────→ │            │ ──────→ │ compact 单页   │
│ （未来：Codex │          │ badges()   │        │ JSON 数据     │
│  OpenCode…） │          │ compare()  │        └─────────────┘
└─────────────┘          └─────────────┘
```

- TypeScript + Node.js ≥18，ESM，零运行时依赖（fzstd 可选）
- 解析层与统计层通过 `NormalizedEvent` 解耦，新增数据源零改动统计/报告层
- 纯函数统计：`aggregate(events, opts) → DevWrappedReport`
- Cordis 插件壳（`src/index.ts`）：注册 `dev.wrapped` 命令复用 CLI 主流程

## 3. 已发布功能（v0.1.0 ~ v1.0.0）

### v0.1.0 ~ v0.2.0（核心链路）

- [x] DSH 适配器：扫描 `~/.dsh/sessions`，zstd 流式解压（CLI 优先，fzstd 回退），JSONL → NormalizedEvent
- [x] 统计聚合：会话/轮数/工具调用/活跃天数/token（缺失即 null，禁止估算）、文件读写去重、扩展名分布、24h/星期分布、每日时间线、top 工具/会话/工作区、最长会话/最复杂任务
- [x] 子代理会话默认排除（`--include-subagents` 并入工具统计）
- [x] HTML 报告卡片（纯 CSS 图表，深色渐变，无外部资源）+ JSON 输出
- [x] CLI 参数：`--since/--until/--adapter/--dsh-home/--output/--json/--include-subagents`
- [x] Cordis 插件入口 `dev.wrapped`

### v1.0.0（多数据源 + 报告升级 + 统计深化 + 工程加固）

- [x] Claude Code 适配器（`~/.claude/projects` JSONL），`--adapter auto` 自动检测
- [x] story 逐屏滚动叙事模式（默认）+ compact 紧凑单页（`--compact`）
- [x] i18n 中英双语报告（`--lang zh|en`）
- [x] 年度模式 `--year YYYY`、成本估算 `--estimate-cost`（DeepSeek 公开单价，标注"估算"）
- [x] 统计深化：工具错误率排行、深夜编码占比、工作日/周末分布、模型分布、agentPreset 分布
- [x] 工程：GitHub Actions CI（Node 18/20/22 矩阵）、changesets、fuzz 容错测试（损坏 zstd/截断行/空文件）、126 单测
- [x] README 双安装方式（DSH 插件 / 克隆本地运行）

## 4. v1.1.0 开发计划（本次迭代）

### 4.1 成就徽章系统

**用户价值**：游戏化激励 + 分享传播点，Spotify Wrapped 的精髓。

**产品规则**：
- 基于 `DevWrappedReport` 现有数据纯函数计算，不新增解析逻辑
- 徽章定义（阈值暂定，真实数据验证后可调）：

| 徽章 | ID | 条件 |
|---|---|---|
| 🌙 深夜代码手 | late-night | lateNightRatio ≥ 0.10 |
| 🦉 夜猫子 | night-owl | peakHour ∈ {22,23,0,…,4} |
| 🌅 晨间开发者 | early-bird | peakHour ∈ {5,…,9} |
| 🔧 工具收藏家 | tool-collector | 去重工具数 ≥ 15 |
| 🎯 多面手 | multi-category | 覆盖工具类别 ≥ 5 |
| 🏋️ 周末战士 | weekend-warrior | 周末工具调用占比 ≥ 0.30 |
| 🔥 持之以恒 | persistent | activeDays ≥ 10 |
| 💬 话痨 | chatterbox | totalTurns ≥ 100 |
| ⚡ 高产选手 | productive | totalToolCalls ≥ 1000 |
| 🏔️ 马拉松选手 | marathon | 最长会话 ≥ 2 小时 |
| 🛡️ 稳如磐石 | rock-solid | 总调用 ≥ 100 且整体错误率 < 5% |

- 展示：story 模式新增"成就徽章墙"一屏；compact 模式新增徽章小节；JSON 报告含 `badges` 数组
- 无任何徽章达成时显示鼓励文案，不显示空区块
- 徽章文案随 `--lang` 中英切换

### 4.2 年度对比模式

**用户价值**："成长曲线"是年度回顾最有传播力的叙事（今年 vs 去年）。

**产品规则**：
- CLI 新增 `--compare`：需配合 `--year YYYY`（不带 --year 时默认当前年份），对比该年与上一年
- 实现方式：events 全量已在内存，按两个年份范围各聚合一次，**零额外解析成本**
- 对比指标：会话数、对话轮数、工具调用、活跃天数（tokens 双方均完整时才对比）
- 上一年无数据：跳过对比并在终端提示，报告不渲染对比区块
- 展示：story 新增"同比成长"一屏（涨跌箭头 + 百分比）；compact 新增对比小节；JSON 含 `yearComparison`
- 涨跌文案中性化（"+37%"而非"进步/退步"），避免数据小导致负面体验

### 4.3 交付物（已全部完成，v1.1.0 已发布）

- [x] `src/types.ts`：`Badge`、`YearComparison` 类型
- [x] `src/badges.ts`：徽章定义与计算（纯函数）
- [x] `src/cli.ts`：`--compare` 参数 + 双年聚合（`buildCompareMetrics`）
- [x] `src/i18n.ts`：徽章名/描述、对比文案（中英）
- [x] `src/report/story.ts`（徽章墙 + 年度成长屏）/ `html.ts`（徽章小节 + 对比表格）
- [x] 单测 140/140（徽章阈值边界 10 个 + 渲染 3 个）+ 真实数据端到端（7/11 徽章达成）
- [x] README、CHANGELOG、版本号 1.1.0，tag v1.1.0 已推送

## 5. v1.2.0 开发计划（本次迭代）

### 5.1 跨数据源合并报告（--adapter all）

**用户价值**：同时使用 DSH 和 Claude Code 的开发者（本产品的核心用户画像）目前只能生成两份独立报告；合并后一份报告看全貌。市场内无同类能力，是架构优势转化为产品壁垒的关键一步。

**产品规则**：
- `--adapter all`：同时实例化 DshAdapter 与 ClaudeCodeAdapter，两个数据根目录分别扫描，事件流合并后统一聚合
- 任一数据源目录不存在：跳过并提示，只统计存在的那个（不报错）
- 两个都存在：报告标题显示 "DSH + Claude Code Dev Wrapped"
- 新增 `adapterSources` 统计字段：`[{ source: 'dsh', sessions: N }, { source: 'claude-code', sessions: M }]`，story/compact 渲染数据源分布小节
- `--adapter auto` 行为保持不变（提示用户可用 all）
- 实现注意：`NormalizedEvent` 无数据源标记，事件需在解析阶段打上 source 标签（`session-start` 头新增可选 `source` 字段），`adapterSources` 按会话归属统计

### 5.2 开发者人格画像（Personality）

**用户价值**：类 Spotify Listening Personality 的传播点；配合徽章系统形成"解锁+贴标签"双游戏化闭环。

**产品规则**：
- 纯本地规则计算（无 AI 调用），输入 `DevWrappedReport`，输出一个人格
- 六种人格（两两正交维度组合）：

| 维度 A（作息） | 维度 B（风格） | 人格 |
|---|---|---|
| 夜猫子（峰值 20-5 点） | 重型（轮均工具调用 ≥ 8） | 🌃 午夜建筑师 Night Architect |
| 夜猫子 | 轻型（< 8） | 🌙 月下对话者 Moonlight Conversationalist |
| 日间（峰值 6-12 点） | 重型 | 🌅 晨光指挥官 Dawn Commander |
| 日间 | 轻型 | ☕ 上午茶谈客 Morning Tea Talker |
| 傍晚（峰值 12-19 点） | 重型 | ⚡ 高效推进器 Afternoon Sprinter |
| 傍晚 | 轻型 | 🌤️ 稳健工匠 Steady Craftsman |

- 边界：无峰值数据时按"日间"处理；工具调用总数为 0 时不输出人格
- 展示：story 在徽章屏之前加"人格"一屏（大图标 + 人格名 + 一句话描述）；compact 新增人格小节；JSON 含 `personality` 字段
- 中英文案同步

### 5.3 交付物（已全部完成，v1.2.0 已发布）

- [x] `src/types.ts`：`AdapterSourceStat`、`Personality` 类型；`session-start` 事件新增 `source?` 字段
- [x] `src/adapters/*`：解析时写入 source
- [x] `src/cli.ts`：`--adapter all` 双扫描合并 + `adapterSources` 聚合
- [x] `src/personality.ts`：人格计算纯函数
- [x] `src/i18n.ts`：6 人格中英文名 + 描述 + 数据源分布文案
- [x] `src/report/story.ts`（人格屏 + 数据源分布屏）/ `html.ts`（人格小节 + 数据源分布小节）
- [x] 单测 154/154（人格维度边界 11 个 + source 聚合 3 个）+ 真实数据端到端（66 会话合并，人格"午夜建筑师"）
- [x] README、CHANGELOG、版本号 1.2.0，tag v1.2.0

## 6. 后续路线图（v1.3+，未排期）

- 徽章等级（铜/银/金）与隐藏彩蛋徽章（996 警告 / 子代理奴役主）
- AI 生成个性化年度总结文案（输出结构化 prompt 让用户贴回 AI 会话生成，零 API 成本）
- 年度时间线回放（story 按月分屏，每月一个高光数字）
- 分享海报模式（竖版长图单屏 HTML，手机截图直发）
- 多数据源扩展：Codex / OpenCode / Hermes 适配器——巩固"唯一多数据源回顾工具"定位
- npm 发布（待用户解决 2FA/passkey 问题后），打通 `npx` 与 DSH 市场主流安装方式

## 7. 统计口径（延续 v1.0.0，不变）

- 子代理默认排除；打开开关后仅并入工具统计，不计会话总数
- token 只累加真实 usage；缺失即整体 null，禁止估算
- 用户消息过滤 isInjected 注入内容
- 日期过滤基准为 session createdAt（本地时区）
- 成本估算仅 `--estimate-cost` 显式开启，卡片必须标注"估算"
