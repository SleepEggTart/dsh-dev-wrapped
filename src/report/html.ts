/**
 * HTML 报告卡片生成（阶段四起为 --compact 紧凑单页模式）
 *
 * 单 HTML 文件、零外部依赖、深色蓝紫渐变背景、系统中文字体栈。
 * 布局：标题 + 时间范围 → 4 个核心大数字 → 工具排行（纯 CSS 横向条形图 TOP8）
 *       → 24h 活跃分布（纯 CSS 柱状）→ 亮点卡片 → topSessions → 底部署名。
 * 响应式（手机/桌面均美观）；文案按 lang 输出（默认中文）。
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Badge, DevWrappedReport } from '../types.js'
import type { Lang } from '../i18n.js'
import { t, compareMetricKey } from '../i18n.js'
import { BADGE_ICONS, badgeNameKey, badgeDescKey } from '../badges.js'
import { PERSONALITY_ICONS, personalityNameKey, personalityDescKey } from '../personality.js'
import { DEEPSEEK_PRICING, fmtCost } from '../cost.js'
import { esc, fmt, fmtDuration, fmtTokens, fmtDateTime } from './format.js'
import { localDateKey, reportBaseName } from './json.js'
import { reportTitle } from './story.js'

/** 工具排行 TOP8 横向条形图 */
function renderToolBars(report: DevWrappedReport, lang: Lang): string {
  const top = report.toolUsage.slice(0, 8)
  if (top.length === 0) return `<p class="empty">${t(lang, 'noToolData')}</p>`
  const max = top[0].count
  return top
    .map(
      (tool, i) => `
        <div class="bar-row">
          <span class="bar-rank">${i + 1}</span>
          <span class="bar-name" title="${esc(tool.name)}">${esc(tool.name)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.max(4, Math.round((tool.count / max) * 100))}%"></div>
          </div>
          <span class="bar-count">${fmt(tool.count)}</span>
          <span class="bar-cat">${esc(tool.category)}</span>
        </div>`,
    )
    .join('')
}

/** 24 小时活跃分布柱状图 */
function renderHourly(report: DevWrappedReport, lang: Lang): string {
  const max = Math.max(...report.timeline.hourlyActivity, 1)
  const peak = report.timeline.peakHour
  const bars = report.timeline.hourlyActivity
    .map((c, h) => {
      const height = Math.round((c / max) * 100)
      const cls = c === 0 ? 'hour-bar empty' : h === peak ? 'hour-bar peak' : 'hour-bar'
      return `<div class="hour-cell"><div class="${cls}" style="height:${Math.max(height, 3)}%"></div><span class="hour-label">${h}</span></div>`
    })
    .join('')
  const peakText =
    peak !== null ? t(lang, 'peakLabel', { hh: String(peak).padStart(2, '0') }) : t(lang, 'noData')
  return `<div class="hours-head"><span>${t(lang, 'hourlyTitle')}</span><span class="hours-peak">${peakText}</span></div><div class="hours">${bars}</div>`
}

/** 亮点卡片 */
function renderHighlights(report: DevWrappedReport, lang: Lang): string {
  const { highlights } = report
  const cards: string[] = []
  const dash = t(lang, 'empty')

  // 最爱工具
  cards.push(
    `<div class="hl-card"><div class="hl-icon">🛠️</div><div class="hl-label">${t(lang, 'favoriteTool')}</div><div class="hl-value">${highlights.favoriteTool ? esc(highlights.favoriteTool) : dash}</div></div>`,
  )
  // 最爱项目
  const ws = highlights.favoriteWorkspace
  cards.push(
    `<div class="hl-card"><div class="hl-icon">📁</div><div class="hl-label">${t(lang, 'favoriteWorkspace')}</div><div class="hl-value small" title="${ws ? esc(ws) : ''}">${ws ? esc(ws) : dash}</div></div>`,
  )
  // 最长会话
  const ls = highlights.longestSession
  cards.push(
    `<div class="hl-card"><div class="hl-icon">⏱️</div><div class="hl-label">${t(lang, 'longestSession')}</div><div class="hl-value">${ls ? fmtDuration(ls.durationMs, lang) : dash}</div><div class="hl-sub">${ls ? `${fmt(ls.toolCalls)} ${t(lang, 'unitToolCalls')} · ${ls.turns} ${t(lang, 'unitTurns')}` : ''}</div></div>`,
  )
  // 最复杂任务
  const mc = highlights.mostComplexTask
  cards.push(
    `<div class="hl-card"><div class="hl-icon">🧩</div><div class="hl-label">${t(lang, 'mostComplexTask')}</div><div class="hl-value">${mc ? `${fmt(mc.totalSteps)} ${t(lang, 'unitSteps')}` : dash}</div><div class="hl-sub">${mc ? `${mc.uniqueTools.length} ${t(lang, 'unitToolsKinds')}` : ''}</div></div>`,
  )
  return cards.join('')
}

/** 热门会话列表 */
function renderTopSessions(report: DevWrappedReport, lang: Lang): string {
  if (report.topSessions.length === 0) return ''
  const rows = report.topSessions
    .map((s, i) => {
      const ws = esc(s.workspace)
      const tools = s.topTools.map((tool) => `<code>${esc(tool)}</code>`).join(' ')
      return `<tr><td class="rank">${i + 1}</td><td class="ws" title="${ws}">${ws}</td><td>${fmtDateTime(s.createdAt)}</td><td class="num">${fmt(s.turns)}</td><td class="num">${fmt(s.toolCalls)}</td><td class="tools">${tools}</td></tr>`
    })
    .join('')
  return `
    <section class="card">
      <h2>${t(lang, 'topSessionsTitle')}</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>${t(lang, 'thProject')}</th><th>${t(lang, 'thStart')}</th><th>${t(lang, 'thTurns')}</th><th>${t(lang, 'thToolCalls')}</th><th>${t(lang, 'thTopTools')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`
}

/** 工具稳定性小节（阶段五：错误率排行，无错误数据时显示满分文案） */
function renderToolStability(report: DevWrappedReport, lang: Lang): string {
  const top = report.toolErrors.slice(0, 5)
  const sub = t(lang, 'toolStabilitySub', { max: String(top.length || 5) })
  if (top.length === 0) {
    return `
    <section class="card">
      <h2>${t(lang, 'toolStabilityTitle')}<span class="sub">${sub}</span></h2>
      <p class="empty">${t(lang, 'noErrorData')}</p>
    </section>`
  }
  const rows = top
    .map(
      (tool) =>
        `<tr><td class="ws" title="${esc(tool.name)}">${esc(tool.name)}</td><td class="num">${fmt(tool.errors)}</td><td class="num">${fmt(tool.calls)}</td><td class="num">${(tool.errorRate * 100).toFixed(1)}%</td></tr>`,
    )
    .join('')
  return `
    <section class="card">
      <h2>${t(lang, 'toolStabilityTitle')}<span class="sub">${sub}</span></h2>
      <div class="table-wrap"><table>
        <thead><tr><th>${t(lang, 'thTool')}</th><th>${t(lang, 'thErrors')}</th><th>${t(lang, 'thToolCalls')}</th><th>${t(lang, 'thErrorRate')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`
}

/** 开发者人格小节（v1.2.0：personality 非空才渲染） */
function renderPersonality(report: DevWrappedReport, lang: Lang): string {
  const p = report.personality
  if (!p) return ''
  const icon = PERSONALITY_ICONS[p.id] ?? '🧑‍💻'
  return `
    <section class="card personality-card">
      <h2>${t(lang, 'personalityTitle')}</h2>
      <div class="personality-row">
        <span class="p-big-icon">${icon}</span>
        <span class="p-txt">
          <b class="p-name">${esc(t(lang, personalityNameKey(p.id) as never))}</b>
          <small class="p-desc">${esc(t(lang, personalityDescKey(p.id) as never))}</small>
        </span>
      </div>
    </section>`
}

/** 数据源分布小节（v1.2.0：--adapter all 多数据源才渲染） */
function renderSourceDist(report: DevWrappedReport, lang: Lang): string {
  if (report.adapterSources.length <= 1) return ''
  const total = report.adapterSources.reduce((a, b) => a + b.sessions, 0)
  const rows = report.adapterSources
    .map((s) => {
      const label = s.source === 'claude-code' ? 'sourceClaudeCode' : 'sourceDsh'
      const pct = total > 0 ? Math.round((s.sessions / total) * 100) : 0
      return `<div class="src-row"><span class="src-label">${t(lang, label as never)}</span><span class="src-bar"><span class="src-fill" style="width:${pct}%"></span></span><span class="src-num">${fmt(s.sessions)} · ${pct}%</span></div>`
    })
    .join('')
  return `
    <section class="card">
      <h2>${t(lang, 'sourceDistTitle')}<span class="sub">${t(lang, 'sourceDistSub', { n: report.adapterSources.length })}</span></h2>
      <div class="src-list">${rows}</div>
    </section>`
}

/** 徽章等级角标（v1.3.0：🥉铜 / 🥈银 / 🥇金，与 story 保持一致） */
const LEVEL_ICONS: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
}

/** 徽章小节（v1.1.0：compact 模式，展示达成的徽章及达成条件描述；v1.3.0 等级角标） */
function renderBadges(report: DevWrappedReport, lang: Lang): string {
  const earned = report.badges.filter((b) => b.earned)
  // 分母只统计常规徽章（隐藏彩蛋不计入总数）
  const regularTotal = report.badges.filter((b) => !b.hidden).length
  const sub = t(lang, 'badgesSub', { n: earned.length, total: regularTotal })
  if (earned.length === 0) {
    return `
    <section class="card">
      <h2>${t(lang, 'badgesTitle')}<span class="sub">${sub}</span></h2>
      <p class="empty">${t(lang, 'noBadgeEarned')}</p>
    </section>`
  }
  const items = earned
    .map((b) => {
      const icon = (BADGE_ICONS[b.id] ?? '🏅') + (b.level ? LEVEL_ICONS[b.level] : '')
      const name = t(lang, badgeNameKey(b.id))
      const desc = badgeDescText(b, lang)
      return `<div class="badge-chip"><span class="badge-ico">${icon}</span><span class="badge-txt"><b>${esc(name)}</b><small>${esc(desc)}</small></span></div>`
    })
    .join('')
  return `
    <section class="card">
      <h2>${t(lang, 'badgesTitle')}<span class="sub">${sub}</span></h2>
      <div class="badge-chips">${items}</div>
    </section>`
}

/** 徽章达成条件的描述文案（按徽章语义格式化 value） */
function badgeDescText(b: Badge, lang: Lang): string {
  switch (b.id) {
    case 'late-night':
    case 'weekend-warrior':
    case 'rock-solid':
      return t(lang, badgeDescKey(b.id), { pct: `${Math.round(b.value * 100)}%` })
    case 'night-owl':
    case 'early-bird':
      return t(lang, badgeDescKey(b.id), { hh: b.value >= 0 ? String(b.value).padStart(2, '0') : '--' })
    case 'marathon':
      return t(lang, badgeDescKey(b.id), { dur: fmtDuration(b.value, lang) })
    default:
      return t(lang, badgeDescKey(b.id), { n: fmt(b.value) })
  }
}

/** 年度对比小节（v1.1.0：--compare 且上一年有数据） */
function renderYearComparison(report: DevWrappedReport, lang: Lang): string {
  const cmp = report.yearComparison
  if (!cmp) return ''
  const rows = cmp.metrics
    .map((m) => {
      const delta =
        m.delta === null
          ? `<span class="delta new">${t(lang, 'compareNewStart')}</span>`
          : `<span class="delta ${m.delta >= 0 ? 'up' : 'down'}">${m.delta >= 0 ? '+' : ''}${(m.delta * 100).toFixed(0)}%</span>`
      return `<tr><td>${t(lang, compareMetricKey(m.key))}</td><td class="num">${fmt(m.previous)}</td><td class="num">${fmt(m.current)}</td><td class="num">${delta}</td></tr>`
    })
    .join('')
  return `
    <section class="card">
      <h2>${t(lang, 'compareTitle')}<span class="sub">${t(lang, 'compareSub', { cur: cmp.currentYear, prev: cmp.previousYear })}</span></h2>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th class="num">${cmp.previousYear}</th><th class="num">${cmp.currentYear}</th><th class="num">Δ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`
}

/** 生成完整 HTML 报告（compact 紧凑单页模式） */
export function toHtmlReport(report: DevWrappedReport, lang: Lang = 'zh'): string {
  const { overview, timeline, fileOps } = report
  const startDate = localDateKey(report.timeRange.start)
  const endDate = localDateKey(report.timeRange.end)
  const tokens = overview.tokens
  const tokenText = tokens
    ? `${fmtTokens(tokens.input, lang)} ${t(lang, 'tokensIn')} / ${fmtTokens(tokens.output, lang)} ${t(lang, 'tokensOut')}`
    : t(lang, 'tokensMissing')
  // 标题按年度模式优先，其次按适配器切换（adapterId 由 CLI 层写入）
  const title = reportTitle(report, lang)
  const dataSourceText = t(
    lang,
    'footerDataFrom',
    {
      source: t(
        lang,
        report.adapterId === 'claude-code'
          ? 'dataSourceClaude'
          : report.adapterId === 'all'
            ? 'dataSourceAll'
            : 'dataSourceDsh',
      ),
    },
  )
  // 成本估算（显式开启且 tokens 完整时有值；必须带"估算"标注）
  const cost = report.costEstimate

  return `<!DOCTYPE html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root {
    --bg1: #0f0c29; --bg2: #302b63; --bg3: #24243e;
    --card: rgba(255,255,255,.06);
    --card-border: rgba(255,255,255,.12);
    --text: #f0efff; --muted: #a5a3c9;
    --accent: #8b7cf8; --accent2: #6ee7ff;
    --bar: linear-gradient(90deg, #8b7cf8, #6ee7ff);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    background: linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 50%, var(--bg3) 100%);
    color: var(--text); min-height: 100vh; padding: 32px 16px 48px;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 28px; }
  header h1 {
    font-size: clamp(1.8rem, 5vw, 2.6rem); font-weight: 800; letter-spacing: 1px;
    background: linear-gradient(90deg, #a78bfa, #6ee7ff);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  header .range { color: var(--muted); margin-top: 8px; font-size: .95rem; }
  header .range b { color: var(--text); }

  .grid4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 22px; }
  .stat { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px 12px; text-align: center; }
  .stat .num { font-size: clamp(1.6rem, 4.5vw, 2.2rem); font-weight: 800; color: var(--accent2); }
  .stat .label { color: var(--muted); margin-top: 6px; font-size: .85rem; }

  .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 22px; margin-bottom: 22px; }
  .card h2 { font-size: 1.05rem; margin-bottom: 16px; color: var(--text); }
  .card h2 .sub { color: var(--muted); font-weight: 400; font-size: .85rem; margin-left: 8px; }

  .bar-row { display: grid; grid-template-columns: 22px 130px 1fr 64px; grid-template-rows: auto auto; column-gap: 10px; row-gap: 2px; align-items: center; margin-bottom: 10px; font-size: .9rem; }
  .bar-rank { color: var(--muted); text-align: center; }
  .bar-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { grid-column: 3; }
  .bar-fill { height: 12px; border-radius: 6px; background: var(--bar); min-width: 6px; transition: width .4s ease; }
  .bar-count { text-align: right; color: var(--accent2); font-variant-numeric: tabular-nums; }
  .bar-cat { grid-column: 1 / -1; grid-row: 2; font-size: .72rem; color: var(--muted); padding-left: 32px; }

  .hours-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .hours-head span:first-child { font-size: 1.05rem; }
  .hours-peak { color: var(--accent2); font-size: .85rem; }
  .hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 4px; height: 110px; align-items: end; }
  .hour-cell { display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
  .hour-bar { width: 100%; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #8b7cf8, #4c46a0); min-height: 3px; }
  .hour-bar.peak { background: linear-gradient(180deg, #6ee7ff, #8b7cf8); box-shadow: 0 0 10px rgba(110,231,255,.5); }
  .hour-bar.empty { background: rgba(255,255,255,.08); }
  .hour-label { font-size: .58rem; color: var(--muted); margin-top: 4px; }

  .hl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
  .hl-card { background: rgba(255,255,255,.04); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; text-align: center; }
  .hl-icon { font-size: 1.6rem; margin-bottom: 8px; }
  .hl-label { color: var(--muted); font-size: .8rem; margin-bottom: 6px; }
  .hl-value { font-size: 1.15rem; font-weight: 700; color: var(--accent2); word-break: break-all; }
  .hl-value.small { font-size: .85rem; }
  .hl-sub { color: var(--muted); font-size: .75rem; margin-top: 6px; }

  .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
  .meta-item { display: flex; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,.04); border-radius: 10px; font-size: .88rem; }
  .meta-item .k { color: var(--muted); }
  .meta-item .v { font-weight: 600; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
  th { color: var(--muted); font-weight: 500; font-size: .78rem; }
  td.rank { color: var(--muted); }
  td.ws { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--accent2); }
  td.tools code { background: rgba(139,124,248,.18); border-radius: 4px; padding: 2px 6px; font-size: .74rem; margin-right: 4px; }

  .ext-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .ext-chip { background: rgba(139,124,248,.15); border: 1px solid rgba(139,124,248,.3); border-radius: 999px; padding: 5px 12px; font-size: .8rem; }
  .ext-chip b { color: var(--accent2); }

  footer { text-align: center; color: var(--muted); font-size: .78rem; margin-top: 10px; line-height: 1.8; }
  .empty { color: var(--muted); font-size: .9rem; }

  /* v1.1.0 徽章与年度对比 */
  .badge-chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .badge-chip {
    display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,.05); border: 1px solid var(--card-border);
    border-radius: 12px; padding: 10px 14px;
  }
  .badge-ico { font-size: 1.5rem; line-height: 1; }
  .badge-txt { display: flex; flex-direction: column; }
  .badge-txt small { color: var(--muted); font-size: .72rem; margin-top: 2px; }
  .delta { font-weight: 700; }
  .delta.up { color: #6ee7a0; }
  .delta.down { color: #ff9e9e; }
  .delta.new { color: #ffd479; }

  /* v1.2.0 人格与数据源分布 */
  .personality-row { display: flex; align-items: center; gap: 16px; }
  .p-big-icon { font-size: 2.6rem; line-height: 1; }
  .p-txt { display: flex; flex-direction: column; }
  .p-name { font-size: 1.2rem; }
  .p-desc { color: var(--muted); font-size: .8rem; margin-top: 4px; }
  .src-list { display: flex; flex-direction: column; gap: 8px; }
  .src-row { display: flex; align-items: center; gap: 12px; }
  .src-label { min-width: 110px; }
  .src-bar { flex: 1; height: 8px; background: rgba(255,255,255,.12); border-radius: 4px; overflow: hidden; }
  .src-fill { display: block; height: 100%; background: linear-gradient(90deg, #7c6cff, #4ecdc4); }
  .src-num { min-width: 110px; text-align: right; color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }

  @media (max-width: 640px) {
    .bar-row { grid-template-columns: 20px 90px 1fr 54px; font-size: .8rem; }
    .hours { gap: 2px; }
    .hour-label { font-size: .5rem; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>⚡ ${title}</h1>
    <div class="range"><b>${startDate}</b> → <b>${endDate}</b>（${t(lang, 'rangeDays', { n: fmt(report.timeRange.days) })}）</div>
  </header>

  <div class="grid4">
    <div class="stat"><div class="num">${fmt(overview.totalSessions)}</div><div class="label">${t(lang, 'statSessions')}</div></div>
    <div class="stat"><div class="num">${fmt(overview.totalTurns)}</div><div class="label">${t(lang, 'statTurns')}</div></div>
    <div class="stat"><div class="num">${fmt(overview.totalToolCalls)}</div><div class="label">${t(lang, 'statToolCalls')}</div></div>
    <div class="stat"><div class="num">${fmt(overview.activeDays)}</div><div class="label">${t(lang, 'statActiveDays')}</div></div>
  </div>

  <section class="card">
    <h2>${t(lang, 'toolRankTitle')}<span class="sub">${t(lang, 'toolRankSub', { n: fmt(overview.totalToolCalls) })}</span></h2>
    ${renderToolBars(report, lang)}
  </section>

  <section class="card">
    ${renderHourly(report, lang)}
  </section>

  <section class="card">
    <h2>${t(lang, 'highlightsTitle')}</h2>
    <div class="hl-grid">${renderHighlights(report, lang)}</div>
  </section>

  <section class="card">
    <h2>${t(lang, 'moreDataTitle')}</h2>
    <div class="meta-grid">
      <div class="meta-item"><span class="k">${t(lang, 'userMessages')}</span><span class="v">${fmt(overview.totalUserMessages)}</span></div>
      <div class="meta-item"><span class="k">${t(lang, 'tokenUsage')}</span><span class="v">${tokenText}</span></div>
      ${
        cost
          ? `<div class="meta-item"><span class="k">${t(lang, 'costEstimate')}</span><span class="v" title="${esc(t(lang, 'costEstimateNote', { model: cost.model, in: DEEPSEEK_PRICING.input, out: DEEPSEEK_PRICING.output }))}">${fmtCost(cost.total)}</span></div>`
          : ''
      }
      <div class="meta-item"><span class="k">${t(lang, 'filesRead')}</span><span class="v">${fmt(fileOps.filesRead)}</span></div>
      <div class="meta-item"><span class="k">${t(lang, 'filesWritten')}</span><span class="v">${fmt(fileOps.filesWritten)}</span></div>
      ${
        timeline.peakDay
          ? `<div class="meta-item"><span class="k">${t(lang, 'peakDay')}</span><span class="v">${timeline.peakDay}</span></div>`
          : ''
      }
      ${
        fileOps.topFileExtensions.length > 0
          ? `<div class="meta-item"><span class="k">${t(lang, 'topExts')}</span><span class="v">${esc(fileOps.topFileExtensions.slice(0, 3).map((e) => '.' + e.ext).join(' / '))}</span></div>`
          : ''
      }
      ${
        timeline.lateNightRatio !== null
          ? `<div class="meta-item"><span class="k">${t(lang, 'lateNightRatio')}</span><span class="v" title="${esc(t(lang, 'lateNightNote', { pct: `${Math.round(timeline.lateNightRatio * 100)}%` }))}">${Math.round(timeline.lateNightRatio * 100)}%</span></div>`
          : ''
      }
      ${
        timeline.weekdayActivity.length === 7 && overview.totalToolCalls > 0
          ? `<div class="meta-item"><span class="k">${t(lang, 'weekdayVsWeekend')}</span><span class="v">${t(lang, 'weekdayVsWeekendNote', {
              wd: fmt(timeline.weekdayActivity.slice(0, 5).reduce((a, b) => a + b, 0)),
              we: fmt(timeline.weekdayActivity.slice(5).reduce((a, b) => a + b, 0)),
            })}</span></div>`
          : ''
      }
      ${
        report.models.length > 0
          ? `<div class="meta-item"><span class="k">${t(lang, 'modelDist')}</span><span class="v" title="${esc(report.models.map((m) => `${m.model}: ${fmt(m.messages)}`).join(' · '))}">${esc(report.models[0].model)}</span></div>`
          : ''
      }
      ${
        report.agentPresets.length > 0
          ? `<div class="meta-item"><span class="k">${t(lang, 'agentPresetDist')}</span><span class="v" title="${esc(report.agentPresets.map((p) => `${p.preset}: ${fmt(p.sessions)}`).join(' · '))}">${esc(report.agentPresets[0].preset)}</span></div>`
          : ''
      }
    </div>
  </section>

  ${renderPersonality(report, lang)}

  ${renderBadges(report, lang)}

  ${renderToolStability(report, lang)}

  ${renderTopSessions(report, lang)}

  ${renderYearComparison(report, lang)}

  ${renderSourceDist(report, lang)}

  <footer>
    ${t(lang, 'footerGeneratedBy')} · ${dataSourceText}<br>
    ${fmtDateTime(report.generatedAt)}
  </footer>
</div>
</body>
</html>`
}

/** 写入 HTML 报告文件，返回文件绝对路径 */
export async function writeHtmlReport(
  report: DevWrappedReport,
  outputDir: string,
  lang: Lang = 'zh',
  /** 文件名后缀（如 '-compact'；story 模式附带的总结页用，避免覆盖主报告） */
  fileSuffix = '',
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `${reportBaseName(report)}${fileSuffix}.html`)
  await fs.writeFile(filePath, toHtmlReport(report, lang), 'utf8')
  return filePath
}
