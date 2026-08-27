/**
 * 报告共享格式化工具（compact 单页与 story 叙事页复用）
 *
 * 数字本地化：zh 用 万/亿 缩写，en 用 K/M 缩写；
 * HTML 转义对工具名、路径等不可信文本强制执行。
 */
import type { Lang } from '../i18n.js'

/** HTML 转义（数据中的工具名、路径等不可信文本） */
export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 千分位分隔（zh-CN 与 en-US 的分组习惯一致） */
export function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

/** 时长人性化：天/时/分（按语言输出单位） */
export function fmtDuration(ms: number, lang: Lang): string {
  if (ms <= 0) return '—'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return lang === 'zh' ? '< 1 分钟' : '< 1m'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const u = (v: number, unit: string) => `${v} ${unit}`
  const parts: string[] = []
  if (days > 0) parts.push(u(days, lang === 'zh' ? '天' : 'd'))
  if (hours > 0) parts.push(u(hours, lang === 'zh' ? '小时' : 'h'))
  if (mins > 0 && days === 0) parts.push(u(mins, lang === 'zh' ? '分钟' : 'm'))
  return parts.slice(0, 2).join(' ') || u(mins, lang === 'zh' ? '分钟' : 'm')
}

/** token 数值友好化（zh：万/亿；en：K/M） */
export function fmtTokens(n: number, lang: Lang): string {
  if (lang === 'zh') {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} 亿`
    if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`
    return fmt(n)
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return fmt(n)
}

/** 时间戳 → 'YYYY-MM-DD HH:mm' */
export function fmtDateTime(time: number): string {
  const d = new Date(time)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
