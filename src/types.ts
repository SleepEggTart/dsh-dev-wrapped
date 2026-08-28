/**
 * 统一事件模型与适配器接口
 *
 * 解析层与统计层解耦：统计层只消费 NormalizedEvent，
 * 不感知数据来自哪个 CLI。v2 接入 Claude Code / Codex 时
 * 只需新增 SessionAdapter 实现，统计与报告层零改动。
 */

/** 会话归属：主会话 / 子代理会话 */
export type SessionOrigin = 'main' | 'subagent'

/** 统一事件模型 */
export type NormalizedEvent =
  | {
      kind: 'session-start'
      sessionId: string
      createdAt: number
      cwd: string
      origin: SessionOrigin
      agentPreset?: string
    }
  | { kind: 'turn-start'; sessionId: string; turn: number; time: number }
  | {
      /** isInjected: <system-reminder> 等注入内容，不计入用户消息数 */
      kind: 'user-message'
      sessionId: string
      time: number
      text: string
      isInjected: boolean
    }
  | {
      kind: 'assistant-message'
      sessionId: string
      time: number
      model?: string
      textLength: number
      usage?: { input: number; output: number }
    }
  | {
      kind: 'tool-call'
      sessionId: string
      turn: number
      step: number
      callId: string
      name: string
      args: Record<string, unknown>
      time: number
    }
  | { kind: 'tool-result'; sessionId: string; callId: string; isError: boolean; time: number }

/** 适配器扫描出的原始会话文件 */
export interface RawSessionFile {
  /** 会话文件绝对路径 */
  filePath: string
  /** 会话标识（扫描阶段先用目录名兜底，解析后以 session 头真实 id 为准） */
  sessionId: string
  /** workspace 编码目录名（仅作溯源，不可解码出真实路径，真实目录取 session 头 cwd） */
  workspaceDir: string
}

/** 会话头窥探结果（CLI 全量解析前的概要统计用） */
export interface SessionHeader {
  id: string
  createdAt: number
  cwd: string
  origin: SessionOrigin
  agentPreset?: string
}

/** 会话数据适配器接口 */
export interface SessionAdapter {
  /** 适配器标识，如 'dsh'、'claude-code' */
  readonly id: string
  /** 扫描数据根目录，返回全部会话文件（主会话与子代理均包含） */
  scan(rootDir: string): Promise<RawSessionFile[]>
  /** 解析单个会话文件，映射后的事件通过 onEvent 逐个发出 */
  parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void>
  /** 可选：窥探会话头（只读首行/首几行），供 CLI 统计主/子代理数与工作目录数 */
  peekSessionHeader?(file: RawSessionFile): Promise<SessionHeader | null>
}

/* ==================== 报告数据结构 ==================== */

/** 成本估算结果（--estimate-cost 显式开启时才有值；卡片上必须标注"估算"） */
export interface CostEstimate {
  /** 计价模型（公开单价来源） */
  model: string
  currency: 'CNY'
  inputTokens: number
  outputTokens: number
  inputCost: number
  outputCost: number
  total: number
}

/** 时间范围 */
export interface TimeRange {
  start: number
  end: number
  days: number
}

/** 总览统计 */
export interface OverviewStats {
  /** 主会话数（不含子代理） */
  totalSessions: number
  totalTurns: number
  totalToolCalls: number
  /** 已过滤 <system-reminder> 注入 */
  totalUserMessages: number
  activeDays: number
  /** 真实 token 用量；存在缺失时为 null（禁止估算） */
  tokens: { input: number; output: number } | null
}

/** 文件操作统计 */
export interface FileOpsStats {
  /** read 工具 file_path 去重计数 */
  filesRead: number
  /** write/edit 工具 file_path 去重计数 */
  filesWritten: number
  /** 从 read/write/edit 的 file_path 提取的扩展名分布 */
  topFileExtensions: Array<{ ext: string; count: number }>
}

/** 单个工具的使用统计 */
export interface ToolUsageStat {
  name: string
  count: number
  category: string
}

/** 单个工具的错误统计（阶段五统计深化） */
export interface ToolErrorStat {
  name: string
  /** isError=true 的 tool-result 次数（按 callId 关联回 tool-call） */
  errors: number
  /** 该工具总调用次数（分母含未返回结果的调用） */
  calls: number
  /** errors / calls，保留 4 位小数 */
  errorRate: number
}

/** 模型分布（按去重后的 assistant-message 条数计） */
export interface ModelUsageStat {
  model: string
  messages: number
}

/** DSH agentPreset 分布（按主会话数计；非 DSH 数据源为空数组） */
export interface AgentPresetStat {
  preset: string
  sessions: number
}

/** 成就徽章（v1.1.0：基于报告数据纯函数计算） */
export interface Badge {
  /** 徽章标识（i18n 文案 key，如 'late-night'） */
  id: string
  /** 是否达成 */
  earned: boolean
  /** 达成进度描述用的原始值（如占比/数量），渲染层按徽章语义使用 */
  value: number
}

/** 年度对比单指标（v1.1.0：--compare 双年聚合） */
export interface YearCompareMetric {
  /** 指标识：sessions / turns / toolCalls / activeDays / tokens */
  key: string
  /** 本年值 */
  current: number
  /** 上一年值 */
  previous: number
  /** (current - previous) / previous，保留 4 位小数；上一年为 0 且本年 > 0 时为 null（无法算百分比） */
  delta: number | null
}

/** 年度对比结果（--compare 开启且上一年有数据时才有值） */
export interface YearComparison {
  currentYear: number
  previousYear: number
  metrics: Array<YearCompareMetric>
}

/** 时间线统计 */
export interface TimelineStats {
  /** 长度 24，tool/call 按小时分布 */
  hourlyActivity: number[]
  dailyActivity: Array<{ date: string; sessions: number; toolCalls: number }>
  peakHour: number | null
  peakDay: string | null
  /** 长度 7，tool-call 按星期分布（0=周一 … 6=周日，本地时区） */
  weekdayActivity: number[]
  /** 0-6 点（含）tool-call 占比（0~1，保留 4 位小数）；无调用时为 null */
  lateNightRatio: number | null
}

/** 亮点 */
export interface Highlights {
  longestSession: {
    id: string
    turns: number
    toolCalls: number
    durationMs: number
    workspace: string
  } | null
  mostComplexTask: {
    sessionId: string
    totalSteps: number
    uniqueTools: string[]
  } | null
  favoriteTool: string | null
  /** toolCalls 最多的 cwd */
  favoriteWorkspace: string | null
}

/** 单个热门会话 */
export interface TopSession {
  id: string
  workspace: string
  createdAt: number
  turns: number
  toolCalls: number
  topTools: string[]
}

/** 完整报告（v2 修订版） */
export interface DevWrappedReport {
  generatedAt: number
  dshHome: string
  adapterId: string
  /** --year 年度模式：年份（如 2026），影响报告标题 */
  yearMode?: number
  /** 成本估算（--estimate-cost 开启且 tokens 完整时有值） */
  costEstimate?: CostEstimate | null
  timeRange: TimeRange
  overview: OverviewStats
  fileOps: FileOpsStats
  toolUsage: Array<ToolUsageStat>
  /** 工具错误率排行（仅含有错误记录的工具，按 errors 降序） */
  toolErrors: Array<ToolErrorStat>
  /** 模型分布（assistant-message.model 聚合，按消息数降序） */
  models: Array<ModelUsageStat>
  /** DSH agentPreset 分布（按主会话数降序；非 DSH 数据源为空数组） */
  agentPresets: Array<AgentPresetStat>
  timeline: TimelineStats
  highlights: Highlights
  topSessions: Array<TopSession>
  /** 成就徽章（v1.1.0：CLI 层聚合后计算填入） */
  badges: Array<Badge>
  /** 年度对比（v1.1.0：--compare 开启且上一年有数据时才有值） */
  yearComparison?: YearComparison
}
