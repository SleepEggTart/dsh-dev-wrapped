/**
 * 统计聚合层单测：子代理排除、token 口径、注入过滤、
 * 日期过滤、文件统计、时间线与亮点
 */
import { describe, expect, it } from 'vitest'
import { aggregate } from '../src/stats/index.js'
import type { NormalizedEvent } from '../src/types.js'

/** 2026-08-20 10:00 本地时间的时间戳构造 */
const ts = (day: number, hour = 10): number => new Date(2026, 7, day, hour, 0, 0, 0).getTime()

/** 构造事件流辅助 */
function ev(...events: NormalizedEvent[]): NormalizedEvent[] {
  return events
}

/** 主会话 A：3 轮 / 5 次工具调用 / 全量 usage */
function mainSessionA(): NormalizedEvent[] {
  const sid = 'main-a'
  return ev(
    { kind: 'session-start', sessionId: sid, createdAt: ts(20, 9), cwd: 'D:\\projA', origin: 'main' },
    { kind: 'turn-start', sessionId: sid, turn: 1, time: ts(20, 9) },
    { kind: 'turn-start', sessionId: sid, turn: 2, time: ts(20, 10) },
    { kind: 'turn-start', sessionId: sid, turn: 3, time: ts(20, 11) },
    { kind: 'user-message', sessionId: sid, time: ts(20, 9), text: '帮我写个函数', isInjected: false },
    { kind: 'user-message', sessionId: sid, time: ts(20, 10), text: '<system-reminder>注入</system-reminder>', isInjected: true },
    { kind: 'assistant-message', sessionId: sid, time: ts(20, 9), textLength: 100, usage: { input: 1000, output: 200 } },
    { kind: 'assistant-message', sessionId: sid, time: ts(20, 10), textLength: 50, usage: { input: 500, output: 100 } },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 1, callId: 'c1', name: 'read', args: { file_path: 'D:\\projA\\src\\a.ts' }, time: ts(20, 9) },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 2, callId: 'c2', name: 'read', args: { file_path: 'D:\\projA\\src\\a.ts' }, time: ts(20, 9) },
    { kind: 'tool-call', sessionId: sid, turn: 2, step: 3, callId: 'c3', name: 'write', args: { file_path: 'D:\\projA\\src\\b.java' }, time: ts(20, 10) },
    { kind: 'tool-call', sessionId: sid, turn: 2, step: 4, callId: 'c4', name: 'pwsh', args: { command: 'ls' }, time: ts(20, 10) },
    { kind: 'tool-call', sessionId: sid, turn: 3, step: 5, callId: 'c5', name: 'edit', args: { file_path: 'D:\\projA\\src\\b.java' }, time: ts(20, 11) },
    { kind: 'tool-result', sessionId: sid, callId: 'c1', isError: false, time: ts(20, 9) },
    { kind: 'tool-result', sessionId: sid, callId: 'c3', isError: true, time: ts(20, 10) },
  )
}

/** 主会话 B：1 轮 / 2 次工具调用 / 缺 usage（触发 tokens=null） */
function mainSessionB(): NormalizedEvent[] {
  const sid = 'main-b'
  return ev(
    { kind: 'session-start', sessionId: sid, createdAt: ts(22, 14), cwd: 'D:\\projB', origin: 'main' },
    { kind: 'turn-start', sessionId: sid, turn: 1, time: ts(22, 14) },
    { kind: 'assistant-message', sessionId: sid, time: ts(22, 14), textLength: 10 },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 1, callId: 'd1', name: 'read', args: { file_path: 'D:\\projB\\c.md' }, time: ts(22, 14) },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 2, callId: 'd2', name: 'web_search', args: { query: 'x' }, time: ts(22, 15) },
  )
}

/** 子代理会话：2 次工具调用 */
function subSession(): NormalizedEvent[] {
  const sid = 'sub-1'
  return ev(
    { kind: 'session-start', sessionId: sid, createdAt: ts(20, 9), cwd: 'D:\\projA', origin: 'subagent' },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 1, callId: 's1', name: 'grep', args: { pattern: 'x' }, time: ts(20, 12) },
    { kind: 'tool-call', sessionId: sid, turn: 1, step: 2, callId: 's2', name: 'read', args: { file_path: 'D:\\projA\\src\\a.ts' }, time: ts(20, 12) },
  )
}

describe('子代理默认排除口径', () => {
  const events = [...mainSessionA(), ...mainSessionB(), ...subSession()]

  it('默认：子代理工具调用不计入，会话数不含子代理', () => {
    const r = aggregate(events)
    expect(r.overview.totalSessions).toBe(2) // main-a + main-b
    expect(r.overview.totalToolCalls).toBe(7) // 5 + 2，不含子代理 2 次
    expect(r.overview.totalTurns).toBe(4) // 3 + 1
  })

  it('includeSubagents：工具调用并入，但会话数与 topSessions 不变', () => {
    const r = aggregate(events, { includeSubagents: true })
    expect(r.overview.totalToolCalls).toBe(9) // 7 + 2
    expect(r.overview.totalSessions).toBe(2)
    expect(r.topSessions.every((s) => s.id.startsWith('main-'))).toBe(true)
  })

  it('子代理会话不产生 topSessions 条目', () => {
    const r = aggregate(events)
    expect(r.topSessions.map((s) => s.id)).not.toContain('sub-1')
  })
})

describe('token 口径（禁止估算）', () => {
  it('任一 assistant-message 缺失 usage → tokens=null', () => {
    const r = aggregate([...mainSessionA(), ...mainSessionB()])
    expect(r.overview.tokens).toBeNull()
  })

  it('全部有 usage → 精确累加', () => {
    const r = aggregate(mainSessionA())
    expect(r.overview.tokens).toEqual({ input: 1500, output: 300 })
  })
})

describe('用户消息与注入过滤', () => {
  it('isInjected 消息不计入 totalUserMessages', () => {
    const r = aggregate(mainSessionA())
    expect(r.overview.totalUserMessages).toBe(1) // 2 条中 1 条为注入
  })
})

describe('日期过滤（基准：session createdAt）', () => {
  const events = [...mainSessionA(), ...mainSessionB()]

  it('since 排除更早会话', () => {
    const r = aggregate(events, { since: ts(21) })
    expect(r.overview.totalSessions).toBe(1) // 只剩 main-b
  })

  it('until 排除更晚会话（含当天边界）', () => {
    const r = aggregate(events, { until: new Date(2026, 7, 20, 23, 59, 59, 999).getTime() })
    expect(r.overview.totalSessions).toBe(1) // 只剩 main-a
  })

  it('组合过滤可全排除', () => {
    const r = aggregate(events, { since: ts(25) })
    expect(r.overview.totalSessions).toBe(0)
  })
})

describe('文件操作统计', () => {
  it('file_path 去重计数与扩展名分布', () => {
    const r = aggregate([...mainSessionA(), ...mainSessionB()])
    // 读取：D:\projA\src\a.ts（主 A 2 次 + 子代理未计）、D:\projB\c.md → 去重 2
    // 写入：D:\projA\src\b.java（write + edit）→ 去重 1
    expect(r.fileOps.filesRead).toBe(2)
    expect(r.fileOps.filesWritten).toBe(1)
    // 扩展名：a.ts ×2（A 内两次 read）、b.java ×2（write+edit）、c.md ×1
    const exts = Object.fromEntries(r.fileOps.topFileExtensions.map((e) => [e.ext, e.count]))
    expect(exts['ts']).toBe(2)
    expect(exts['java']).toBe(2)
    expect(exts['md']).toBe(1)
  })
})

describe('时间线与亮点', () => {
  const events = [...mainSessionA(), ...mainSessionB()]

  it('peakHour 取工具调用最集中的小时', () => {
    const r = aggregate(events)
    // main-a: 9点×2 + 10点×2 + 11点×1；main-b: 14点×1 + 15点×1 → 并列取先者 9
    expect(r.timeline.peakHour).toBe(9)
  })

  it('dailyActivity 日期取并集且数量正确', () => {
    const r = aggregate(events)
    const days = r.timeline.dailyActivity.map((d) => d.date)
    expect(days).toEqual(['2026-08-20', '2026-08-22'])
    const d20 = r.timeline.dailyActivity[0]
    expect(d20.toolCalls).toBe(5)
  })

  it('跨天 resume：工具调用日计入 dailyActivity（无会话创建也出现）', () => {
    const sid = 'main-r'
    const r = aggregate(
      ev(
        { kind: 'session-start', sessionId: sid, createdAt: ts(20, 9), cwd: 'D:\\p', origin: 'main' },
        { kind: 'tool-call', sessionId: sid, turn: 1, step: 1, callId: 'r1', name: 'read', args: {}, time: ts(23, 8) },
      ),
    )
    const dates = r.timeline.dailyActivity.map((d) => d.date)
    expect(dates).toContain('2026-08-23')
    expect(r.overview.activeDays).toBe(2)
  })

  it('longestSession / mostComplexTask / favoriteTool / favoriteWorkspace', () => {
    const r = aggregate(events)
    expect(r.highlights.longestSession?.id).toBe('main-a') // 9点 → 11点 最长
    expect(r.highlights.longestSession?.turns).toBe(3)
    expect(r.highlights.mostComplexTask?.sessionId).toBe('main-a')
    expect(r.highlights.mostComplexTask?.totalSteps).toBe(5)
    expect(r.highlights.favoriteTool).toBe('read') // 3 次（A×2 + B×1）
    expect(r.highlights.favoriteWorkspace).toBe('D:\\projA') // 5 次工具调用
  })

  it('topSessions 按工具调用排序且含 topTools', () => {
    const r = aggregate(events)
    expect(r.topSessions[0]).toMatchObject({ id: 'main-a', toolCalls: 5 })
    expect(r.topSessions[0].topTools[0]).toBe('read') // read×2 领先
  })
})

describe('空数据与工具分类', () => {
  it('空事件流产出零值报告', () => {
    const r = aggregate([])
    expect(r.overview.totalSessions).toBe(0)
    // 无任何模型调用 → 真实为零，而非数据缺失
    expect(r.overview.tokens).toEqual({ input: 0, output: 0 })
    expect(r.timeRange).toEqual({ start: 0, end: 0, days: 0 })
    expect(r.highlights.favoriteTool).toBeNull()
  })

  it('toolUsage 带分类且按次数降序', () => {
    const r = aggregate(mainSessionA())
    expect(r.toolUsage[0]).toMatchObject({ name: 'read', count: 2 })
    const pwsh = r.toolUsage.find((t) => t.name === 'pwsh')
    expect(pwsh?.category).toBe('🖥️ 命令执行')
  })
})

describe('数据源分布与人格（v1.2.0）', () => {
  it('adapterSources：无 source 标记按 dsh 兜底，多来源分别计数', () => {
    // 会话 A 无 source（旧数据兜底 dsh）
    const r1 = aggregate(mainSessionA())
    expect(r1.adapterSources).toEqual([{ source: 'dsh', sessions: 1 }])

    // 会话 A + 一个 claude-code 主会话：两来源各 1
    const claudeSid = 'cc-main'
    const r2 = aggregate([
      ...mainSessionA(),
      { kind: 'session-start', sessionId: claudeSid, createdAt: ts(20, 9), cwd: 'D:\\projC', origin: 'main', source: 'claude-code' },
      { kind: 'tool-call', sessionId: claudeSid, turn: 1, step: 1, callId: 'cc1', name: 'Read', args: {}, time: ts(20, 9) },
    ])
    expect(r2.adapterSources).toContainEqual({ source: 'dsh', sessions: 1 })
    expect(r2.adapterSources).toContainEqual({ source: 'claude-code', sessions: 1 })
    // 合并后会话总数为 2
    expect(r2.overview.totalSessions).toBe(2)
  })

  it('adapterSources：子代理会话不计入来源统计', () => {
    const r = aggregate([
      ...mainSessionA(),
      { kind: 'session-start', sessionId: 'sub-cc', createdAt: ts(20, 9), cwd: 'D:\\projC', origin: 'subagent', source: 'claude-code' },
      { kind: 'tool-call', sessionId: 'sub-cc', turn: 1, step: 1, callId: 'sc1', name: 'Read', args: {}, time: ts(20, 9) },
    ])
    expect(r.adapterSources).toEqual([{ source: 'dsh', sessions: 1 }])
  })

  it('personality：有工具调用时计算，零调用为 null', () => {
    const r = aggregate(mainSessionA())
    // mainSessionA：峰值小时来自工具调用时间（9/10/11 点），轮均 5/3 < 8 → 日间轻型
    expect(r.personality).not.toBeNull()
    expect(r.personality?.rhythm).toBe('day')
    expect(r.personality?.style).toBe('light')

    const empty = aggregate([])
    expect(empty.personality).toBeNull()
  })
})
