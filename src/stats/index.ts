/**
 * 统计聚合层
 *
 * 只消费 NormalizedEvent（不感知数据来自哪个 CLI），
 * 按 v2 提示词第四节统计口径聚合为 DevWrappedReport。
 *
 * 口径要点：
 * - 子代理会话默认排除；includeSubagents 打开时其 tool-call/tool-result
 *   并入总工具统计，但不计入会话总数、不参与 topSessions
 * - token 只累加 assistant-message 携带的真实 usage；存在缺失即整体置 null（禁止估算）
 * - 用户消息数过滤 isInjected（<system-reminder> 注入）
 * - --since/--until 过滤基准是 session 的 createdAt
 * - 最长会话 durationMs：会话内最后事件时间 - createdAt
 */
import type {
  DevWrappedReport,
  Highlights,
  NormalizedEvent,
  ToolUsageStat,
  TopSession,
} from '../types.js'
import { toolCategory } from '../tools.js'

/** 统计选项 */
export interface StatsOptions {
  /** 并入子代理会话的工具调用统计（默认 false） */
  includeSubagents?: boolean
  /** 起始日期（含），epoch ms，本地时区当日 00:00:00 */
  since?: number
  /** 结束日期（含），epoch ms，本地时区当日 23:59:59.999 */
  until?: number
}

/** 单会话聚合中间结构 */
interface SessionAgg {
  id: string
  cwd: string
  createdAt: number
  origin: 'main' | 'subagent'
  turns: number
  toolCalls: number
  /** 会话内出现的最后一个事件时间（用于时长） */
  lastTime: number
  /** 工具名 → 调用次数 */
  toolCounts: Map<string, number>
  /** 每会话最大 step（任务复杂度：总步骤数） */
  maxStep: number
}

/** 从事件流聚合报告 */
export function aggregate(events: NormalizedEvent[], opts: StatsOptions = {}): DevWrappedReport {
  const includeSub = opts.includeSubagents ?? false

  // ---------- 第一遍：收集 session 头，做日期过滤 ----------
  const sessionHeads = new Map<string, { createdAt: number; cwd: string; origin: 'main' | 'subagent' }>()
  for (const e of events) {
    if (e.kind === 'session-start') {
      sessionHeads.set(e.sessionId, { createdAt: e.createdAt, cwd: e.cwd, origin: e.origin })
    }
  }

  // 日期过滤：以 session 的 createdAt 为基准（until 含当天）
  const keptSessionIds = new Set<string>()
  for (const [id, head] of sessionHeads) {
    if (opts.since !== undefined && head.createdAt < opts.since) continue
    if (opts.until !== undefined && head.createdAt > opts.until) continue
    keptSessionIds.add(id)
  }

  // ---------- 第二遍：逐会话聚合 ----------
  const sessions = new Map<string, SessionAgg>()
  const toolUsageAll = new Map<string, number>() // 工具总调用（主 + 可选子代理）
  const hourly = new Array<number>(24).fill(0)
  const dailyToolCalls = new Map<string, number>() // 'YYYY-MM-DD' → toolCalls
  const dailySessions = new Map<string, Set<string>>() // 'YYYY-MM-DD' → 会话 id 集合
  const filesRead = new Set<string>()
  const filesWritten = new Set<string>()
  const extCounts = new Map<string, number>()

  let totalTurns = 0
  let totalUserMessages = 0
  let tokensInput = 0
  let tokensOutput = 0
  let tokensMissing = false
  // callId → 所属会话（tool-result 归属用）
  const callIdToSession = new Map<string, string>()

  const getSession = (id: string, fallbackTime: number): SessionAgg | null => {
    // 日期过滤外的会话事件不统计
    if (!keptSessionIds.has(id)) return null
    // 主会话始终参与；子代理按开关并入工具统计
    const head = sessionHeads.get(id)
    if (!head) return null
    if (head.origin === 'subagent' && !includeSub) return null
    let agg = sessions.get(id)
    if (!agg) {
      agg = {
        id,
        cwd: head.cwd,
        createdAt: head.createdAt,
        origin: head.origin,
        turns: 0,
        toolCalls: 0,
        lastTime: head.createdAt,
        toolCounts: new Map(),
        maxStep: 0,
      }
      sessions.set(id, agg)
    }
    if (fallbackTime > agg.lastTime) agg.lastTime = fallbackTime
    return agg
  }

  /** 本地时区 'YYYY-MM-DD' */
  const localDateKey = (time: number): string => {
    const d = new Date(time)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }

  /** 从文件路径提取扩展名（小写，无扩展名返回 null） */
  const extOf = (filePath: string): string | null => {
    const base = filePath.split(/[\\/]/).pop() ?? ''
    const dot = base.lastIndexOf('.')
    if (dot <= 0 || dot === base.length - 1) return null // 无扩展名 / 隐藏文件 / 以 . 结尾
    return base.slice(dot + 1).toLowerCase()
  }

  for (const e of events) {
    switch (e.kind) {
      case 'turn-start': {
        const agg = getSession(e.sessionId, e.time)
        if (agg && e.turn > agg.turns) agg.turns = e.turn // turn 递增，取最大值即轮数
        break
      }
      case 'user-message': {
        const agg = getSession(e.sessionId, e.time)
        if (agg && !e.isInjected) totalUserMessages++
        break
      }
      case 'assistant-message': {
        const agg = getSession(e.sessionId, e.time)
        if (!agg) break
        if (e.usage) {
          tokensInput += e.usage.input
          tokensOutput += e.usage.output
        } else {
          // 口径：任何一条缺失即整体为 null（不估算）
          tokensMissing = true
        }
        break
      }
      case 'tool-call': {
        const agg = getSession(e.sessionId, e.time)
        if (!agg) break
        agg.toolCalls++
        agg.toolCounts.set(e.name, (agg.toolCounts.get(e.name) ?? 0) + 1)
        toolUsageAll.set(e.name, (toolUsageAll.get(e.name) ?? 0) + 1)
        callIdToSession.set(e.callId, e.sessionId)
        hourly[new Date(e.time).getHours()]++
        dailyToolCalls.set(localDateKey(e.time), (dailyToolCalls.get(localDateKey(e.time)) ?? 0) + 1)
        if (e.step > agg.maxStep) agg.maxStep = e.step
        // 文件路径提取（read/write/edit 的 file_path 参数）；
        // 工具名比较统一小写：DSH 为 read/write，Claude Code 为 Read/Write/MultiEdit 等
        const fp = typeof e.args.file_path === 'string' ? e.args.file_path : undefined
        if (fp) {
          const tool = e.name.toLowerCase()
          if (tool === 'read') {
            filesRead.add(fp)
          } else if (
            tool === 'write' ||
            tool === 'edit' ||
            tool === 'multiedit' ||
            tool === 'notebookedit' ||
            tool === 'str_replace_editor'
          ) {
            filesWritten.add(fp)
          }
          const ext = extOf(fp)
          if (ext) {
            extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
          }
        }
        break
      }
      case 'tool-result': {
        // tool-result 通过 callId 关联到 tool-call 所属会话（已含过滤逻辑）
        const sid = callIdToSession.get(e.callId)
        if (sid) getSession(sid, e.time)
        break
      }
      case 'session-start':
        // 头已在第一遍处理；这里只需登记日活
        break
    }
  }

  // 日活登记：每个保留会话按其 createdAt 计入当天（子代理不计入日活会话数）
  for (const id of keptSessionIds) {
    const head = sessionHeads.get(id)!
    if (head.origin === 'subagent') continue
    const key = localDateKey(head.createdAt)
    let set = dailySessions.get(key)
    if (!set) {
      set = new Set()
      dailySessions.set(key, set)
    }
    set.add(id)
  }

  // ---------- 主会话集合（不含子代理） ----------
  const mainSessions = [...sessions.values()].filter((s) => s.origin === 'main')

  // 会话总数口径：日期过滤内、非子代理的会话数（无论 includeSubagents）
  const totalSessions = [...keptSessionIds].filter((id) => sessionHeads.get(id)?.origin === 'main').length

  for (const s of mainSessions) {
    totalTurns += s.turns
  }

  // 工具总调用数：主会话 + （可选）子代理
  let totalToolCalls = 0
  for (const s of sessions.values()) totalToolCalls += s.toolCalls

  // ---------- 亮点 ----------
  const longest = mainSessions.reduce<SessionAgg | null>(
    (best, s) =>
      best === null || s.lastTime - s.createdAt > best.lastTime - best.createdAt ? s : best,
    null,
  )
  const mostComplex = mainSessions.reduce<SessionAgg | null>(
    (best, s) => (best === null || s.maxStep > best.maxStep ? s : best),
    null,
  )
  let favoriteTool: string | null = null
  let favToolCount = 0
  for (const [name, count] of toolUsageAll) {
    if (count > favToolCount) {
      favoriteTool = name
      favToolCount = count
    }
  }
  // 最爱项目：主会话中 toolCalls 最多的 cwd
  const cwdToolCounts = new Map<string, number>()
  for (const s of mainSessions) {
    cwdToolCounts.set(s.cwd, (cwdToolCounts.get(s.cwd) ?? 0) + s.toolCalls)
  }
  let favoriteWorkspace: string | null = null
  let favWsCount = 0
  for (const [ws, count] of cwdToolCounts) {
    if (count > favWsCount) {
      favoriteWorkspace = ws
      favWsCount = count
    }
  }

  // ---------- 时间线 ----------
  // 日期集合取并集：会话创建日 ∪ 工具调用日
  // （跨天 resume 的会话：创建日之外的后续活动日也应有记录）
  const allDays = new Set<string>([...dailySessions.keys(), ...dailyToolCalls.keys()])
  const dailyActivity = [...allDays]
    .map((date) => ({
      date,
      sessions: dailySessions.get(date)?.size ?? 0,
      toolCalls: dailyToolCalls.get(date) ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let peakHour: number | null = null
  let peakHourCount = -1
  hourly.forEach((c, h) => {
    if (c > peakHourCount) {
      peakHourCount = c
      peakHour = h
    }
  })
  if (peakHourCount <= 0) peakHour = null
  let peakDay: string | null = null
  let peakDayCount = -1
  for (const d of dailyActivity) {
    if (d.toolCalls > peakDayCount) {
      peakDayCount = d.toolCalls
      peakDay = d.date
    }
  }
  if (peakDayCount <= 0) peakDay = null

  // 时间范围：保留会话的最早 createdAt 与最后事件时间
  let rangeStart = Number.POSITIVE_INFINITY
  let rangeEnd = 0
  for (const s of sessions.values()) {
    if (s.createdAt < rangeStart) rangeStart = s.createdAt
    if (s.lastTime > rangeEnd) rangeEnd = s.lastTime
  }
  if (!Number.isFinite(rangeStart)) {
    rangeStart = 0
    rangeEnd = 0
  }
  const days = rangeEnd > 0 ? Math.max(1, Math.ceil((rangeEnd - rangeStart) / 86_400_000)) : 0

  // ---------- 工具排行 ----------
  const toolUsage: ToolUsageStat[] = [...toolUsageAll.entries()]
    .map(([name, count]) => ({ name, count, category: toolCategory(name) }))
    .sort((a, b) => b.count - a.count)

  // ---------- topSessions（主会话按 toolCalls 排序 TOP5） ----------
  const topSessions: TopSession[] = [...mainSessions]
    .sort((a, b) => b.toolCalls - a.toolCalls)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      workspace: s.cwd,
      createdAt: s.createdAt,
      turns: s.turns,
      toolCalls: s.toolCalls,
      topTools: [...s.toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name),
    }))

  // ---------- highlights ----------
  const highlights: Highlights = {
    longestSession: longest
      ? {
          id: longest.id,
          turns: longest.turns,
          toolCalls: longest.toolCalls,
          durationMs: longest.lastTime - longest.createdAt,
          workspace: longest.cwd,
        }
      : null,
    mostComplexTask: mostComplex
      ? {
          sessionId: mostComplex.id,
          totalSteps: mostComplex.maxStep,
          uniqueTools: [...mostComplex.toolCounts.keys()].sort(),
        }
      : null,
    favoriteTool,
    favoriteWorkspace,
  }

  // ---------- 汇总 ----------
  // 活跃天数与 dailyActivity 口径一致：会话创建日 ∪ 工具调用日
  const activeDays = allDays.size

  return {
    generatedAt: Date.now(),
    dshHome: '', // 由 CLI 层填充
    adapterId: 'dsh',
    timeRange: { start: rangeStart, end: rangeEnd, days },
    overview: {
      totalSessions,
      totalTurns,
      totalToolCalls,
      totalUserMessages,
      activeDays,
      tokens: tokensMissing ? null : { input: tokensInput, output: tokensOutput },
    },
    fileOps: {
      filesRead: filesRead.size,
      filesWritten: filesWritten.size,
      topFileExtensions: [...extCounts.entries()]
        .map(([ext, count]) => ({ ext, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    toolUsage,
    timeline: { hourlyActivity: hourly, dailyActivity, peakHour, peakDay },
    highlights,
    topSessions,
  }
}
