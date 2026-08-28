/**
 * 开发者人格模块测试（v1.2.0）
 *
 * 验证作息 × 风格两维组合的 6 种人格、边界条件与工具函数。
 */
import { describe, expect, it } from 'vitest'
import { computePersonality, personalityNameKey, personalityDescKey, PERSONALITY_ICONS } from '../src/personality.js'
import type { DevWrappedReport } from '../src/types.js'

/** 构造最小报告（只填人格计算所需字段） */
function makeReport(patch: {
  toolCalls?: number
  turns?: number
  peakHour?: number | null
}): DevWrappedReport {
  return {
    overview: {
      totalSessions: 1,
      totalTurns: patch.turns ?? 0,
      totalToolCalls: patch.toolCalls ?? 0,
      totalUserMessages: 1,
      activeDays: 1,
      tokens: null,
    },
    timeline: {
      hourlyActivity: new Array<number>(24).fill(0),
      dailyActivity: [],
      peakHour: patch.peakHour ?? null,
      peakDay: null,
      weekdayActivity: new Array<number>(7).fill(0),
      lateNightRatio: null,
    },
  } as unknown as DevWrappedReport
}

describe('computePersonality 维度组合', () => {
  it('夜猫子 + 重型 = 午夜建筑师', () => {
    // 峰值 23 点，轮均 10 次调用
    const p = computePersonality(makeReport({ toolCalls: 100, turns: 10, peakHour: 23 }))
    expect(p).toEqual({ id: 'night-architect', rhythm: 'night', style: 'heavy' })
  })

  it('夜猫子 + 轻型 = 月下对话者（峰值 0 点跨午夜）', () => {
    const p = computePersonality(makeReport({ toolCalls: 20, turns: 10, peakHour: 0 }))
    expect(p).toEqual({ id: 'moonlight-conversationalist', rhythm: 'night', style: 'light' })
  })

  it('日间 + 重型 = 晨光指挥官（峰值 9 点）', () => {
    const p = computePersonality(makeReport({ toolCalls: 80, turns: 10, peakHour: 9 }))
    expect(p).toEqual({ id: 'dawn-commander', rhythm: 'day', style: 'heavy' })
  })

  it('日间 + 轻型 = 上午茶谈客（峰值 12 点整归日间）', () => {
    const p = computePersonality(makeReport({ toolCalls: 20, turns: 10, peakHour: 12 }))
    expect(p).toEqual({ id: 'morning-tea-talker', rhythm: 'day', style: 'light' })
  })

  it('傍晚 + 重型 = 高效推进器（峰值 15 点，轮均恰好 8 为重型边界）', () => {
    const p = computePersonality(makeReport({ toolCalls: 80, turns: 10, peakHour: 15 }))
    expect(p).toEqual({ id: 'afternoon-sprinter', rhythm: 'evening', style: 'heavy' })
  })

  it('傍晚 + 轻型 = 稳健工匠（轮均 7.9 为轻型边界）', () => {
    const p = computePersonality(makeReport({ toolCalls: 79, turns: 10, peakHour: 19 }))
    expect(p).toEqual({ id: 'steady-craftsman', rhythm: 'evening', style: 'light' })
  })

  it('边界：20 点整归夜猫子，19 点归傍晚，6 点归日间', () => {
    expect(computePersonality(makeReport({ toolCalls: 10, turns: 5, peakHour: 20 }))?.rhythm).toBe('night')
    expect(computePersonality(makeReport({ toolCalls: 10, turns: 5, peakHour: 19 }))?.rhythm).toBe('evening')
    expect(computePersonality(makeReport({ toolCalls: 10, turns: 5, peakHour: 6 }))?.rhythm).toBe('day')
  })

  it('无峰值数据按日间处理；工具调用为 0 返回 null', () => {
    expect(computePersonality(makeReport({ toolCalls: 10, turns: 5, peakHour: null }))?.rhythm).toBe('day')
    expect(computePersonality(makeReport({ toolCalls: 0, turns: 5, peakHour: 10 }))).toBeNull()
  })

  it('轮数为 0 的异常数据按轻型处理（避免除零）', () => {
    const p = computePersonality(makeReport({ toolCalls: 100, turns: 0, peakHour: 10 }))
    expect(p).toEqual({ id: 'morning-tea-talker', rhythm: 'day', style: 'light' })
  })
})

describe('人格工具函数', () => {
  it('personalityNameKey / personalityDescKey kebab-case 转换', () => {
    expect(personalityNameKey('night-architect')).toBe('personalityNightArchitect')
    expect(personalityNameKey('steady-craftsman')).toBe('personalitySteadyCraftsman')
    expect(personalityDescKey('moonlight-conversationalist')).toBe('personalityMoonlightConversationalistDesc')
  })

  it('PERSONALITY_ICONS 覆盖全部 6 种人格', () => {
    const ids = [
      'night-architect',
      'moonlight-conversationalist',
      'dawn-commander',
      'morning-tea-talker',
      'afternoon-sprinter',
      'steady-craftsman',
    ]
    for (const id of ids) {
      expect(PERSONALITY_ICONS[id], `人格 ${id} 缺少图标`).toBeDefined()
    }
  })
})
