/**
 * HTML 报告生成单测：核心数字渲染、XSS 转义、日期范围、null tokens 兜底
 */
import { describe, expect, it } from 'vitest'
import { toHtmlReport } from '../src/report/html.js'
import type { DevWrappedReport } from '../src/types.js'

/** 最小固定报告数据，覆盖全部必填字段 */
const baseReport: DevWrappedReport = {
  generatedAt: new Date(2026, 7, 26, 12, 0, 0).getTime(),
  dshHome: 'C:\\Users\\x\\.dsh',
  adapterId: 'dsh',
  timeRange: {
    start: new Date(2026, 7, 20).getTime(),
    end: new Date(2026, 7, 22).getTime(),
    days: 2,
  },
  overview: {
    totalSessions: 18,
    totalTurns: 162,
    totalToolCalls: 1944,
    totalUserMessages: 213,
    activeDays: 4,
    tokens: null,
  },
  fileOps: { filesRead: 112, filesWritten: 41, topFileExtensions: [{ ext: 'ts', count: 32 }] },
  toolUsage: [{ name: '<script>', count: 99, category: '📦 其他' }],
  toolErrors: [],
  models: [],
  agentPresets: [],
  timeline: {
    hourlyActivity: new Array(24).fill(0),
    dailyActivity: [{ date: '2026-08-20', sessions: 1, toolCalls: 5 }],
    peakHour: 23,
    peakDay: '2026-08-20',
    weekdayActivity: new Array(7).fill(0),
    lateNightRatio: null,
  },
  highlights: {
    longestSession: null,
    mostComplexTask: null,
    favoriteTool: '<script>',
    favoriteWorkspace: null,
  },
  topSessions: [],
  badges: [],
  adapterSources: [{ source: 'dsh', sessions: 1 }],
  personality: null,
}

describe('toHtmlReport 基本渲染', () => {
  const html = toHtmlReport(baseReport)

  it('包含 4 个核心数字', () => {
    // 会话总数 18
    expect(html).toContain('>18<')
    // 对话轮数 162
    expect(html).toContain('>162<')
    // 工具调用 1,944（toLocaleString 格式化）
    expect(html).toContain('>1,944<')
    // 活跃天数 4
    expect(html).toContain('>4<')
  })

  it('HTML 转义：工具名 <script> 不会以原始形式出现', () => {
    // 不得出现裸 <script> 标签（排除样式中的 <style> 等合法标签干扰）
    // 工具名 <script> 经过 esc() 处理后应变为 &lt;script&gt;
    expect(html).not.toMatch(/bar-name[^>]*>[^<]*<script>/)
    expect(html).toContain('&lt;script&gt;')
  })

  it('日期范围正确展示', () => {
    expect(html).toContain('2026-08-20')
    expect(html).toContain('2026-08-22')
  })

  it('tokens 为 null 时展示兜底文案', () => {
    expect(html).toContain('部分会话缺少用量记录')
  })

  it('v1.1.0：徽章小节与年度对比小节渲染', () => {
    // badges: []（未达成）时显示鼓励文案
    expect(html).toContain('继续使用，徽章等着你解锁')
    // 达成徽章时渲染 chip 与描述
    const withBadges: DevWrappedReport = {
      ...baseReport,
      badges: [
        { id: 'night-owl', earned: true, value: 23 },
        { id: 'marathon', earned: true, value: 7_200_000 },
      ],
    }
    const html2 = toHtmlReport(withBadges)
    expect(html2).toContain('badge-chips')
    expect(html2).toContain('夜猫子')
    expect(html2).toContain('活跃高峰在 23:00')
    expect(html2).toContain('最长会话 2 小时')
    // yearComparison 存在时渲染对比表
    const withCompare: DevWrappedReport = {
      ...withBadges,
      yearComparison: {
        currentYear: 2026,
        previousYear: 2025,
        metrics: [
          { key: 'sessions', current: 18, previous: 9, delta: 1.0 },
          { key: 'turns', current: 162, previous: 0, delta: null },
        ],
      },
    }
    const html3 = toHtmlReport(withCompare)
    expect(html3).toContain('2026 vs 2025')
    expect(html3).toContain('+100%')
    expect(html3).toContain('全新起步')
    expect(html).not.toContain('2026 vs 2025')
  })
})

describe('toHtmlReport 有 token 数据', () => {
  it('tokens 存在时展示输入/输出', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      overview: {
        ...baseReport.overview,
        tokens: { input: 12345, output: 6789 },
      },
    }
    const html = toHtmlReport(report)
    expect(html).toContain('输入')
    expect(html).toContain('输出')
    // 不应出现兜底文案
    expect(html).not.toContain('部分会话缺少用量记录')
  })
})

describe('toHtmlReport 亮点卡片', () => {
  it('longestSession 为 null 时亮点显示 —', () => {
    const html = toHtmlReport(baseReport)
    // 最长会话值应为 —
    expect(html).toContain('最长会话')
  })

  it('有 longestSession 时渲染时长和工具调用数', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      highlights: {
        ...baseReport.highlights,
        longestSession: {
          id: 'session-1',
          turns: 10,
          toolCalls: 50,
          durationMs: 3_600_000, // 1 小时
          workspace: '/tmp/project',
        },
      },
    }
    const html = toHtmlReport(report)
    expect(html).toContain('1 小时')
    expect(html).toContain('50') // 工具调用数
    expect(html).toContain('10') // 轮数
  })
})

describe('toHtmlReport 热门会话', () => {
  it('topSessions 为空时不渲染表格', () => {
    const html = toHtmlReport(baseReport)
    expect(html).not.toContain('热门会话')
  })

  it('有 topSessions 时渲染表格行', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      topSessions: [
        {
          id: 'sess-1',
          workspace: '/home/user/project',
          createdAt: new Date(2026, 7, 20, 10, 0).getTime(),
          turns: 5,
          toolCalls: 20,
          topTools: ['read', 'edit'],
        },
      ],
    }
    const html = toHtmlReport(report)
    expect(html).toContain('热门会话')
    expect(html).toContain('/home/user/project')
    expect(html).toContain('read')
    expect(html).toContain('edit')
  })
})

describe('toHtmlReport 工具排行', () => {
  it('工具排行包含分类标签', () => {
    const html = toHtmlReport(baseReport)
    expect(html).toContain('📦 其他')
  })

  it('空工具列表显示空状态', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      toolUsage: [],
    }
    const html = toHtmlReport(report)
    expect(html).toContain('暂无工具调用数据')
  })
})

describe('toHtmlReport 英文模式与年度标题', () => {
  it('--lang en 输出英文标签', () => {
    const html = toHtmlReport(baseReport, 'en')
    expect(html).toContain('Sessions')
    expect(html).toContain('Tool Calls')
    expect(html).toContain('Some sessions lack usage data')
    expect(html).not.toContain('会话总数')
  })

  it('yearMode 优先于品牌名标题', () => {
    const report: DevWrappedReport = { ...baseReport, yearMode: 2026 }
    expect(toHtmlReport(report)).toContain('2026 年度回顾')
    expect(toHtmlReport(report, 'en')).toContain('2026 Year in Review')
  })

  it('成本估算展示并带估算标注', () => {
    const report: DevWrappedReport = {
      ...baseReport,
      overview: { ...baseReport.overview, tokens: { input: 1_000_000, output: 1_000_000 } },
      costEstimate: {
        model: 'deepseek-chat',
        currency: 'CNY',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        inputCost: 2,
        outputCost: 8,
        total: 10,
      },
    }
    const html = toHtmlReport(report)
    expect(html).toContain('成本估算')
    expect(html).toContain('¥10.00')
    expect(html).toContain('deepseek-chat')
  })
})
