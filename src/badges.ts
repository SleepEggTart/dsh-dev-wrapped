/**
 * 成就徽章系统（v1.1.0）
 *
 * 基于 DevWrappedReport 现有数据纯函数计算，不新增解析逻辑。
 * 阈值定义见 docs/PRD.md 第 4.1 节；文案 key 见 src/i18n.ts。
 */
import type { Badge, DevWrappedReport } from './types.js'
import type { StringsKey } from './i18n.js'

/** 徽章 id → 图标（渲染层展示用；未命中兜底 🏅） */
export const BADGE_ICONS: Record<string, string> = {
  'late-night': '🌙',
  'night-owl': '🦉',
  'early-bird': '🌅',
  'tool-collector': '🔧',
  'multi-category': '🎯',
  'weekend-warrior': '🏋️',
  persistent: '🔥',
  chatterbox: '💬',
  productive: '⚡',
  marathon: '🏔️',
  'rock-solid': '🛡️',
}

/** 徽章 id（kebab-case）→ i18n 名称键（badgeLateNight 等） */
export function badgeNameKey(id: string): StringsKey {
  return ('badge' + id
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')) as StringsKey
}

/** 徽章 id（kebab-case）→ i18n 描述键（badgeLateNightDesc 等） */
export function badgeDescKey(id: string): StringsKey {
  return (badgeNameKey(id) + 'Desc') as StringsKey
}

/** 徽章阈值常量（真实数据验证后可调） */
const THRESHOLDS = {
  /** 深夜占比 ≥ 10% */
  lateNightRatio: 0.1,
  /** 去重工具数 ≥ 15 */
  uniqueTools: 15,
  /** 覆盖工具类别 ≥ 5 */
  categories: 5,
  /** 周末工具调用占比 ≥ 30% */
  weekendRatio: 0.3,
  /** 活跃天数 ≥ 10 */
  activeDays: 10,
  /** 对话轮数 ≥ 100 */
  turns: 100,
  /** 工具调用总数 ≥ 1000 */
  toolCalls: 1000,
  /** 最长会话 ≥ 2 小时 */
  marathonMs: 2 * 60 * 60 * 1000,
  /** 稳如磐石：总调用 ≥ 100 且错误率 < 5% */
  solidMinCalls: 100,
  solidMaxErrorRate: 0.05,
} as const

/** 22:00 ~ 04:59 的峰值小时（夜猫子） */
const NIGHT_OWL_HOURS = new Set([22, 23, 0, 1, 2, 3, 4])
/** 05:00 ~ 09:59 的峰值小时（晨间开发者） */
const EARLY_BIRD_HOURS = new Set([5, 6, 7, 8, 9])

/** 计算全部徽章（含未达成项，渲染层可自行过滤） */
export function computeBadges(report: DevWrappedReport): Badge[] {
  const badges: Badge[] = []
  const t = report.timeline

  // 🌙 深夜代码手：0-6 点工具调用占比
  const lateNight = t.lateNightRatio
  badges.push({
    id: 'late-night',
    earned: lateNight !== null && lateNight >= THRESHOLDS.lateNightRatio,
    value: lateNight ?? 0,
  })

  // 🦉 夜猫子：峰值小时落在 22:00-04:59
  const peak = t.peakHour
  badges.push({
    id: 'night-owl',
    earned: peak !== null && NIGHT_OWL_HOURS.has(peak),
    value: peak ?? -1,
  })

  // 🌅 晨间开发者：峰值小时落在 05:00-09:59
  badges.push({
    id: 'early-bird',
    earned: peak !== null && EARLY_BIRD_HOURS.has(peak),
    value: peak ?? -1,
  })

  // 🔧 工具收藏家：去重工具数
  badges.push({
    id: 'tool-collector',
    earned: report.toolUsage.length >= THRESHOLDS.uniqueTools,
    value: report.toolUsage.length,
  })

  // 🎯 多面手：覆盖工具类别数
  const categories = new Set(report.toolUsage.map((tool) => tool.category)).size
  badges.push({
    id: 'multi-category',
    earned: categories >= THRESHOLDS.categories,
    value: categories,
  })

  // 🏋️ 周末战士：周六+周日工具调用占比
  let weekendCalls = 0
  for (const d of [5, 6]) weekendCalls += t.weekdayActivity[d] ?? 0
  const totalWeekdayCalls = t.weekdayActivity.reduce((a, b) => a + b, 0)
  const weekendRatio = totalWeekdayCalls > 0 ? weekendCalls / totalWeekdayCalls : 0
  badges.push({
    id: 'weekend-warrior',
    earned: totalWeekdayCalls > 0 && weekendRatio >= THRESHOLDS.weekendRatio,
    value: weekendRatio,
  })

  // 🔥 持之以恒：活跃天数
  badges.push({
    id: 'persistent',
    earned: report.overview.activeDays >= THRESHOLDS.activeDays,
    value: report.overview.activeDays,
  })

  // 💬 话痨：对话轮数
  badges.push({
    id: 'chatterbox',
    earned: report.overview.totalTurns >= THRESHOLDS.turns,
    value: report.overview.totalTurns,
  })

  // ⚡ 高产选手：工具调用总数
  badges.push({
    id: 'productive',
    earned: report.overview.totalToolCalls >= THRESHOLDS.toolCalls,
    value: report.overview.totalToolCalls,
  })

  // 🏔️ 马拉松选手：最长会话时长
  const marathonMs = report.highlights.longestSession?.durationMs ?? 0
  badges.push({
    id: 'marathon',
    earned: marathonMs >= THRESHOLDS.marathonMs,
    value: marathonMs,
  })

  // 🛡️ 稳如磐石：总调用 ≥ 100 且整体错误率 < 5%
  const totalErrors = report.toolErrors.reduce((a, b) => a + b.errors, 0)
  const errorRate = report.overview.totalToolCalls > 0 ? totalErrors / report.overview.totalToolCalls : 1
  badges.push({
    id: 'rock-solid',
    earned:
      report.overview.totalToolCalls >= THRESHOLDS.solidMinCalls &&
      errorRate < THRESHOLDS.solidMaxErrorRate,
    value: errorRate,
  })

  return badges
}
