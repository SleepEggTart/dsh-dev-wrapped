/**
 * v1.3.0 功能测试：徽章等级 / 隐藏彩蛋徽章 / AI 总结 prompt / 逐月回放
 */
import { describe, expect, it } from 'vitest'
import { computeBadges, computeBadgeLevel } from '../src/badges.js'
import { buildSummaryPrompt } from '../src/aiprompt.js'
import { toStoryReport } from '../src/report/story.js'
import type { DevWrappedReport } from '../src/types.js'

function makeReport(patch: Partial<DevWrappedReport> = {}): DevWrappedReport {
  return {
    generatedAt: 0,
    dshHome: '',
    adapterId: 'dsh',
    badges: [],
    timeRange: { start: 0, end: 0, days: 1 },
    overview: {
      totalSessions: 1,
      totalTurns: 1,
      totalToolCalls: 0,
      totalUserMessages: 1,
      activeDays: 1,
      tokens: null,
    },
    fileOps: { filesRead: 0, filesWritten: 0, topFileExtensions: [] },
    toolUsage: [],
    toolErrors: [],
    models: [],
    agentPresets: [],
    timeline: {
      hourlyActivity: new Array<number>(24).fill(0),
      dailyActivity: [],
      peakHour: null,
      peakDay: null,
      weekdayActivity: new Array<number>(7).fill(0),
      lateNightRatio: null,
    },
    highlights: { longestSession: null, mostComplexTask: null, favoriteTool: null, favoriteWorkspace: null },
    topSessions: [],
    adapterSources: [],
    personality: null,
    ...patch,
  } as DevWrappedReport
}

describe('computeBadgeLevel 徽章等级', () => {
  it('达铜未达银 → bronze', () => {
    expect(computeBadgeLevel('productive', 1500, true)).toBe('bronze')
  })
  it('达银未达金 → silver', () => {
    expect(computeBadgeLevel('productive', 4000, true)).toBe('silver')
  })
  it('达金 → gold', () => {
    expect(computeBadgeLevel('productive', 8000, true)).toBe('gold')
  })
  it('未达成 → null；无等级徽章 → null', () => {
    expect(computeBadgeLevel('productive', 500, false)).toBeNull()
    expect(computeBadgeLevel('night-owl', 23, true)).toBeNull()
  })
})

describe('隐藏彩蛋徽章', () => {
  it('996 警告：连续 7 天活跃且日均调用 ≥ 50', () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      sessions: 1,
      toolCalls: 60,
    }))
    const badges = computeBadges(makeReport({ timeline: makeTimeline({ dailyActivity: daily }) }))
    const b = badges.find((x) => x.id === '996-warning')
    expect(b?.earned).toBe(true)
    expect(b?.hidden).toBe(true)
  })

  it('996 警告：连续天数够但日均调用不足 → 未达成', () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      sessions: 1,
      toolCalls: 10,
    }))
    const badges = computeBadges(makeReport({ timeline: makeTimeline({ dailyActivity: daily }) }))
    expect(badges.find((x) => x.id === '996-warning')?.earned).toBe(false)
  })

  it('4AM 俱乐部：凌晨 3-5 点有调用即达成', () => {
    const hourly = new Array<number>(24).fill(0)
    hourly[4] = 3
    const badges = computeBadges(makeReport({ timeline: makeTimeline({ hourlyActivity: hourly }) }))
    const b = badges.find((x) => x.id === '4am-club')
    expect(b?.earned).toBe(true)
    expect(b?.hidden).toBe(true)
  })

  it('彩蛋徽章不计入常规总数分母', () => {
    const badges = computeBadges(makeReport())
    expect(badges).toHaveLength(13)
    expect(badges.filter((b) => !b.hidden)).toHaveLength(11)
  })
})

describe('buildSummaryPrompt AI 总结 prompt', () => {
  it('中文版包含关键统计与徽章', () => {
    const report = makeReport({
      badges: [
        { id: 'night-owl', earned: true, value: 23 },
        { id: '4am-club', earned: false, value: 0, hidden: true },
      ],
    })
    const prompt = buildSummaryPrompt(report, 'zh')
    expect(prompt).toContain('主会话数：1')
    expect(prompt).toContain('night-owl')
    expect(prompt).not.toContain('4am-club')
    expect(prompt).toContain('Spotify Wrapped')
  })

  it('英文版输出英文指令', () => {
    const prompt = buildSummaryPrompt(makeReport(), 'en')
    expect(prompt).toContain('developer-year-recap')
    expect(prompt).toContain('Active days')
  })
})

describe('story 逐月回放', () => {
  it('有活动的月份各渲染一屏', () => {
    const report = makeReport({
      timeline: makeTimeline({
        dailyActivity: [
          { date: '2026-07-15', sessions: 2, toolCalls: 100 },
          { date: '2026-07-20', sessions: 1, toolCalls: 50 },
          { date: '2026-08-01', sessions: 3, toolCalls: 200 },
        ],
      }),
    })
    const html = toStoryReport(report, 'zh')
    expect(html).toContain('2026 年7 月')
    expect(html).toContain('2026 年8 月')
    expect(html).toContain('150') // 7 月合计 toolCalls
    expect(html).toContain('3 个活跃会话') // 8 月 sessions
  })
})

/** 构造 timeline 覆盖块 */
function makeTimeline(patch: Partial<DevWrappedReport['timeline']> = {}): DevWrappedReport['timeline'] {
  return {
    hourlyActivity: new Array<number>(24).fill(0),
    dailyActivity: [],
    peakHour: null,
    peakDay: null,
    weekdayActivity: new Array<number>(7).fill(0),
    lateNightRatio: null,
    ...patch,
  }
}
