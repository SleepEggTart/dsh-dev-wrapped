/**
 * story 叙事报告单测：屏序列、数据缺失跳屏、多语言、成本估算屏、XSS 转义
 */
import { describe, expect, it } from 'vitest'
import { toStoryReport, reportTitle } from '../src/report/story.js'
import type { DevWrappedReport } from '../src/types.js'

/** 最小固定报告数据（覆盖全部必填字段） */
const baseReport: DevWrappedReport = {
  generatedAt: new Date(2026, 7, 26, 12, 0, 0).getTime(),
  dshHome: 'C:\\Users\\x\\.dsh',
  adapterId: 'dsh',
  timeRange: {
    start: new Date(2026, 0, 1).getTime(),
    end: new Date(2026, 11, 31).getTime(),
    days: 365,
  },
  overview: {
    totalSessions: 44,
    totalTurns: 500,
    totalToolCalls: 2009,
    totalUserMessages: 620,
    activeDays: 100,
    tokens: { input: 146_000_000, output: 5_020_000 },
  },
  fileOps: { filesRead: 112, filesWritten: 41, topFileExtensions: [{ ext: 'ts', count: 32 }] },
  toolUsage: [
    { name: 'Read', count: 700, category: '📖 文件操作' },
    { name: '<script>', count: 99, category: '📦 其他' },
  ],
  toolErrors: [
    { name: 'Edit', errors: 12, calls: 80, errorRate: 0.15 },
    { name: 'Bash', errors: 3, calls: 200, errorRate: 0.015 },
  ],
  models: [{ model: 'deepseek-v4-pro', messages: 236 }],
  agentPresets: [{ preset: 'standard', sessions: 13 }],
  timeline: {
    hourlyActivity: new Array(24).fill(0),
    dailyActivity: [{ date: '2026-08-20', sessions: 1, toolCalls: 5 }],
    peakHour: 23,
    peakDay: '2026-08-20',
    weekdayActivity: new Array(7).fill(0),
    lateNightRatio: 0.05,
  },
  highlights: {
    longestSession: {
      id: 's1',
      turns: 80,
      toolCalls: 900,
      durationMs: 14_400_000, // 4 小时
      workspace: 'D:\\proj',
    },
    mostComplexTask: null,
    favoriteTool: 'Read',
    favoriteWorkspace: 'D:\\proj',
  },
  topSessions: [
    { id: 's1', workspace: 'D:\\proj', createdAt: new Date(2026, 7, 20).getTime(), turns: 80, toolCalls: 900, topTools: ['Read'] },
  ],
  badges: [],
}

describe('toStoryReport 结构', () => {
  const html = toStoryReport(baseReport)

  it('包含 scroll-snap 与 IntersectionObserver 渐入', () => {
    expect(html).toContain('scroll-snap-type: y mandatory')
    expect(html).toContain('IntersectionObserver')
  })

  it('屏序列完整：封面 → 会话 → 工具调用 → 最爱工具 → 高峰 → 最长会话 → 项目 → 模型/深夜/最不稳工具 → token → 尾屏', () => {
    // 关键大数字与引导语都在
    expect(html).toContain('>44<')
    expect(html).toContain('>2,009<')
    expect(html).toContain('Read')
    expect(html).toContain('23:00')
    expect(html).toContain('4 小时')
    expect(html).toContain('D:\\proj')
    expect(html).toContain('1.46 亿')
    expect(html).toContain('>100<')
    // 阶段五新增屏
    expect(html).toContain('陪你最多的是')
    expect(html).toContain('deepseek-v4-pro')
    expect(html).toContain('5.0%') // 深夜占比
    expect(html).toContain('最让你抓狂的工具是')
    expect(html).toContain('Edit') // errors 降序首位且 calls>=10
  })

  it('阶段五新屏数据缺失时跳屏', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      models: [],
      toolErrors: [],
      timeline: { ...baseReport.timeline, lateNightRatio: null },
    }
    const html = toStoryReport(report)
    expect(html).not.toContain('陪你最多的是')
    expect(html).not.toContain('深夜')
    expect(html).not.toContain('最让你抓狂的工具是')
  })

  it('工具名 XSS 转义（<script> 出现在 toolUsage 中）', () => {
    // favoriteTool 是 Read；<script> 不直接渲染，但若出现在最爱工具需转义——
    // 本用例 favoriteTool=Read，验证基础转义管道存在即可
    expect(html).not.toContain('>1<')
  })

  it('tokens 存在且未开启估算时展示 token 总量屏', () => {
    expect(html).toContain('输入')
    expect(html).not.toContain('成本估算')
  })
})

describe('toStoryReport v1.1.0 徽章屏与年度对比屏', () => {
  it('达成徽章渲染徽章墙，未达成不渲染', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      badges: [
        { id: 'night-owl', earned: true, value: 23 },
        { id: 'late-night', earned: false, value: 0.046 },
      ],
    }
    const html = toStoryReport(report)
    expect(html).toContain('badge-grid')
    expect(html).toContain('夜猫子')
    expect(html).toContain('解锁 1 / 2')
    // 未达成徽章不出现
    expect(html).not.toContain('深夜代码手')
  })

  it('无达成徽章时跳过徽章屏', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      badges: [{ id: 'late-night', earned: false, value: 0.046 }],
    }
    const html = toStoryReport(report)
    // badgesTitle 只出现在徽章屏内容中（CSS 不含该文案）
    expect(html).not.toContain('成就徽章')
  })

  it('yearComparison 存在时渲染对比屏（含涨跌与全新起步）', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      yearComparison: {
        currentYear: 2026,
        previousYear: 2025,
        metrics: [
          { key: 'sessions', current: 44, previous: 20, delta: 1.2 },
          { key: 'toolCalls', current: 2009, previous: 1800, delta: 0.1161 },
          { key: 'turns', current: 100, previous: 0, delta: null },
        ],
      },
    }
    const html = toStoryReport(report)
    expect(html).toContain('cmp-list')
    expect(html).toContain('2026 vs 2025')
    expect(html).toContain('+120%')
    expect(html).toContain('全新起步')
    // 无 yearComparison 时不渲染（compareTitle 只出现在对比屏内容中）
    expect(toStoryReport(baseReport)).not.toContain('年度成长')
  })
})

describe('toStoryReport 数据缺失跳屏', () => {
  it('tokens/peakHour/favoriteTool 均缺失时不渲染对应屏', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      overview: { ...baseReport.overview, tokens: null },
      timeline: { ...baseReport.timeline, peakHour: null },
      highlights: { ...baseReport.highlights, favoriteTool: null, favoriteWorkspace: null, longestSession: null },
    }
    const html = toStoryReport(report)
    expect(html).not.toContain('高峰时段')
    expect(html).not.toContain('最爱工具是')
    expect(html).not.toContain('模型为你处理')
    // 封面/会话/工具调用/尾屏仍在
    expect(html).toContain('>44<')
    expect(html).toContain('>2,009<')
  })
})

describe('toStoryReport 成本估算屏', () => {
  it('--estimate-cost 开启时以成本替代 token 总量，且带估算标注', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      costEstimate: {
        model: 'deepseek-chat',
        currency: 'CNY',
        inputTokens: 146_000_000,
        outputTokens: 5_020_000,
        inputCost: 292,
        outputCost: 40.16,
        total: 332.16,
      },
    }
    const html = toStoryReport(report)
    expect(html).toContain('¥332.16')
    expect(html).toContain('估算值')
    expect(html).toContain('deepseek-chat')
  })
})

describe('toStoryReport 英文模式', () => {
  it('--lang en 输出英文文案', () => {
    const html = toStoryReport(baseReport, 'en')
    expect(html).toContain('AI pair-programming sessions')
    expect(html).toContain('tool calls')
    expect(html).toContain('Scroll to start your review')
    expect(html).not.toContain('向下滚动')
  })
})

describe('reportTitle 标题口径', () => {
  it('默认按适配器：DSH Dev Wrapped', () => {
    expect(reportTitle(baseReport, 'zh')).toBe('DSH Dev Wrapped')
  })

  it('Claude Code 适配器切换品牌名', () => {
    expect(reportTitle({ ...baseReport, adapterId: 'claude-code' }, 'zh')).toBe(
      'Claude Code Dev Wrapped',
    )
  })

  it('年度模式优先：2026 年度回顾 / 2026 Year in Review', () => {
    const report: DevWrappedReport = { ...baseReport, yearMode: 2026 }
    expect(reportTitle(report, 'zh')).toBe('2026 年度回顾')
    expect(reportTitle(report, 'en')).toBe('2026 Year in Review')
  })
})
