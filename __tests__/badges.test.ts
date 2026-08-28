/**
 * 成就徽章模块测试（v1.1.0）
 *
 * 构造最小 DevWrappedReport 验证各徽章阈值边界与工具函数。
 */
import { describe, expect, it } from 'vitest'
import { computeBadges, badgeNameKey, badgeDescKey, BADGE_ICONS } from '../src/badges.js'
import type { DevWrappedReport } from '../src/types.js'

/** 构造最小可报告对象（按用例覆盖字段） */
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
    ...patch,
  } as DevWrappedReport
}

describe('computeBadges 阈值', () => {
  it('无任何数据时全部未达成', () => {
    const badges = computeBadges(makeReport())
    expect(badges).toHaveLength(13)
    expect(badges.filter((b) => b.earned)).toHaveLength(0)
  })

  it('深夜占比恰好达到 10% 达成深夜代码手', () => {
    const badges = computeBadges(makeReport({ timeline: { ...makeReport().timeline, lateNightRatio: 0.1 } }))
    expect(badges.find((b) => b.id === 'late-night')?.earned).toBe(true)
    // 低于阈值不达成
    const below = computeBadges(makeReport({ timeline: { ...makeReport().timeline, lateNightRatio: 0.09 } }))
    expect(below.find((b) => b.id === 'late-night')?.earned).toBe(false)
  })

  it('峰值小时 23 点是夜猫子、7 点是晨间开发者', () => {
    const owl = computeBadges(makeReport({ timeline: { ...makeReport().timeline, peakHour: 23 } }))
    expect(owl.find((b) => b.id === 'night-owl')?.earned).toBe(true)
    expect(owl.find((b) => b.id === 'early-bird')?.earned).toBe(false)
    const bird = computeBadges(makeReport({ timeline: { ...makeReport().timeline, peakHour: 7 } }))
    expect(bird.find((b) => b.id === 'early-bird')?.earned).toBe(true)
    // 12 点（午间）两者皆非
    const noon = computeBadges(makeReport({ timeline: { ...makeReport().timeline, peakHour: 12 } }))
    expect(noon.find((b) => b.id === 'night-owl')?.earned).toBe(false)
    expect(noon.find((b) => b.id === 'early-bird')?.earned).toBe(false)
  })

  it('工具收藏家按去重工具数、多面手按类别数', () => {
    const tools = Array.from({ length: 15 }, (_, i) => ({
      name: `tool-${i}`,
      count: 1,
      category: i < 5 ? `cat-${i}` : 'cat-0',
    }))
    const badges = computeBadges(makeReport({ toolUsage: tools }))
    expect(badges.find((b) => b.id === 'tool-collector')?.earned).toBe(true)
    expect(badges.find((b) => b.id === 'multi-category')?.earned).toBe(true)
  })

  it('周末战士：周末占比恰好 30% 达成', () => {
    const wd = new Array<number>(7).fill(0)
    wd[5] = 30; wd[6] = 0; wd[0] = 70 // 周末 30 / 总 100
    const badges = computeBadges(makeReport({ timeline: { ...makeReport().timeline, weekdayActivity: wd } }))
    expect(badges.find((b) => b.id === 'weekend-warrior')?.earned).toBe(true)
  })

  it('高产选手 + 持之以恒 + 话痨按数量阈值', () => {
    const badges = computeBadges(
      makeReport({
        overview: { totalSessions: 1, totalTurns: 100, totalToolCalls: 1000, totalUserMessages: 1, activeDays: 10, tokens: null },
      }),
    )
    expect(badges.find((b) => b.id === 'productive')?.earned).toBe(true)
    expect(badges.find((b) => b.id === 'persistent')?.earned).toBe(true)
    expect(badges.find((b) => b.id === 'chatterbox')?.earned).toBe(true)
  })

  it('马拉松：最长会话 ≥ 2 小时', () => {
    const r = makeReport({
      highlights: {
        longestSession: { id: 's', turns: 1, toolCalls: 1, durationMs: 2 * 3600_000, workspace: 'w' },
        mostComplexTask: null,
        favoriteTool: null,
        favoriteWorkspace: null,
      },
    })
    expect(computeBadges(r).find((b) => b.id === 'marathon')?.earned).toBe(true)
  })

  it('稳如磐石：调用 ≥ 100 且错误率 < 5%', () => {
    // 100 次调用 4 次错误 = 4% 达成
    const ok = computeBadges(
      makeReport({
        overview: { totalSessions: 1, totalTurns: 1, totalToolCalls: 100, totalUserMessages: 1, activeDays: 1, tokens: null },
        toolErrors: [{ name: 'Edit', errors: 4, calls: 50, errorRate: 0.08 }],
      }),
    )
    expect(ok.find((b) => b.id === 'rock-solid')?.earned).toBe(true)
    // 6% 不达成
    const bad = computeBadges(
      makeReport({
        overview: { totalSessions: 1, totalTurns: 1, totalToolCalls: 100, totalUserMessages: 1, activeDays: 1, tokens: null },
        toolErrors: [{ name: 'Edit', errors: 6, calls: 50, errorRate: 0.12 }],
      }),
    )
    expect(bad.find((b) => b.id === 'rock-solid')?.earned).toBe(false)
    // 调用不足 100 次即使 0 错误也不达成
    const few = computeBadges(
      makeReport({
        overview: { totalSessions: 1, totalTurns: 1, totalToolCalls: 99, totalUserMessages: 1, activeDays: 1, tokens: null },
      }),
    )
    expect(few.find((b) => b.id === 'rock-solid')?.earned).toBe(false)
  })
})

describe('徽章工具函数', () => {
  it('badgeNameKey / badgeDescKey kebab-case 转换', () => {
    expect(badgeNameKey('late-night')).toBe('badgeLateNight')
    expect(badgeNameKey('rock-solid')).toBe('badgeRockSolid')
    expect(badgeNameKey('persistent')).toBe('badgePersistent')
    expect(badgeDescKey('late-night')).toBe('badgeLateNightDesc')
  })

  it('BADGE_ICONS 覆盖全部徽章 id', () => {
    const ids = computeBadges(makeReport()).map((b) => b.id)
    for (const id of ids) {
      expect(BADGE_ICONS[id], `徽章 ${id} 缺少图标`).toBeDefined()
    }
  })
})
