/**
 * 逐屏滚动叙事报告（阶段四默认输出，Spotify Wrapped 风格）
 *
 * 一屏一个大数字：封面 → 会话数 → 工具调用 → 最爱工具 → 高峰时段
 * → 最长会话 → 最爱项目 → Token/成本 → 尾屏。
 * CSS scroll-snap 逐屏吸附；IntersectionObserver 驱动进入视口时渐入
 * （纯 CSS animation 只在首屏播放，无法响应滚动）。
 * 数据缺失的屏（如无 token）直接跳过，不渲染空屏。
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { DevWrappedReport } from '../types.js'
import type { Lang } from '../i18n.js'
import { t, compareMetricKey } from '../i18n.js'
import { BADGE_ICONS, badgeNameKey } from '../badges.js'
import { PERSONALITY_ICONS, personalityNameKey, personalityDescKey } from '../personality.js'
import { DEEPSEEK_PRICING, fmtCost } from '../cost.js'
import { esc, fmt, fmtDuration, fmtTokens, fmtDateTime } from './format.js'
import { localDateKey, reportBaseName } from './json.js'

/** 徽章等级角标（v1.3.0：🥉铜 / 🥈银 / 🥇金） */
const LEVEL_ICONS: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
}

/** 按月聚合每日活动（v1.3.0 逐月回放用；按月份升序，仅含有活动的月份） */
function aggregateMonths(daily: Array<{ date: string; sessions: number; toolCalls: number }>): Array<{
  year: number
  month: number
  sessions: number
  toolCalls: number
}> {
  const map = new Map<string, { year: number; month: number; sessions: number; toolCalls: number }>()
  for (const d of daily) {
    const [y, m] = d.date.split('-')
    const key = `${y}-${m}`
    let agg = map.get(key)
    if (!agg) {
      agg = { year: Number(y), month: Number(m), sessions: 0, toolCalls: 0 }
      map.set(key, agg)
    }
    agg.sessions += d.sessions
    agg.toolCalls += d.toolCalls
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month)
}

/** 报告标题（品牌名或年度回顾，compact 与 story 共用口径） */
export function reportTitle(report: DevWrappedReport, lang: Lang): string {
  if (report.yearMode !== undefined) {
    return t(lang, 'yearTitle', { year: report.yearMode })
  }
  if (report.adapterId === 'all') return 'DSH + Claude Code Dev Wrapped'
  return report.adapterId === 'claude-code' ? 'Claude Code Dev Wrapped' : 'DSH Dev Wrapped'
}

/** 生成完整 story HTML */
export function toStoryReport(report: DevWrappedReport, lang: Lang = 'zh'): string {
  const { overview, highlights } = report
  const startDate = localDateKey(report.timeRange.start)
  const endDate = localDateKey(report.timeRange.end)
  const title = reportTitle(report, lang)
  const dataSource = t(
    lang,
    report.adapterId === 'claude-code'
      ? 'dataSourceClaude'
      : report.adapterId === 'all'
        ? 'dataSourceAll'
        : 'dataSourceDsh',
  )
  const tokens = overview.tokens

  /** 单屏 HTML：scene 提供主题渐变序号（1-5 循环取色） */
  let scene = 0
  const screen = (inner: string): string => {
    scene = (scene % 5) + 1
    return `<section class="screen s${scene}"><div class="reveal">${inner}</div></section>`
  }

  const screens: string[] = []

  // 1. 封面
  screens.push(
    screen(`
      <div class="kicker">DEV WRAPPED</div>
      <h1>${esc(title)}</h1>
      <div class="range">${startDate} → ${endDate} · ${t(lang, 'rangeDays', { n: report.timeRange.days })}</div>
      <div class="hint">${t(lang, 'storyScrollHint')}</div>
    `),
  )

  // 2. 会话总数
  screens.push(
    screen(`
      <p class="lead">${t(lang, 'storySessionsLead')}</p>
      <div class="big">${fmt(overview.totalSessions)}</div>
      <p class="tail">${t(lang, 'storySessionsTail')}</p>
    `),
  )

  // 3. 工具调用
  screens.push(
    screen(`
      <p class="lead">${t(lang, 'storyToolCallsLead')}</p>
      <div class="big">${fmt(overview.totalToolCalls)}</div>
      <p class="tail">${t(lang, 'storyToolCallsTail')}</p>
    `),
  )

  // 4. 最爱工具（缺失则跳屏）
  if (highlights.favoriteTool) {
    const count = report.toolUsage.find((u) => u.name === highlights.favoriteTool)?.count ?? 0
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyFavToolLead')}</p>
        <div class="big tool">${esc(highlights.favoriteTool)}</div>
        <p class="tail">${t(lang, 'storyFavToolTimes', { n: fmt(count) })}</p>
      `),
    )
  }

  // 5. 高峰时段（缺失则跳屏）
  if (report.timeline.peakHour !== null) {
    const hh = String(report.timeline.peakHour).padStart(2, '0')
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyPeakLead')}</p>
        <div class="big">${hh}:00</div>
        <p class="tail">${t(lang, 'storyPeakTail')}</p>
      `),
    )
  }

  // 6. 最长会话（缺失则跳屏）
  if (highlights.longestSession) {
    const ls = highlights.longestSession
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyLongestLead')}</p>
        <div class="big">${fmtDuration(ls.durationMs, lang)}</div>
        <p class="tail">${t(lang, 'storyLongestSub', {
          tools: fmt(ls.toolCalls),
          turns: ls.turns,
          workspace: ls.workspace,
        })}</p>
      `),
    )
  }

  // 7. 最爱项目（缺失则跳屏）
  if (highlights.favoriteWorkspace) {
    const wsToolCalls = report.topSessions
      .filter((s) => s.workspace === highlights.favoriteWorkspace)
      .reduce((sum, s) => sum + s.toolCalls, 0)
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyWorkspaceLead')}</p>
        <div class="big small-text">${esc(highlights.favoriteWorkspace)}</div>
        <p class="tail">${
          wsToolCalls > 0 ? t(lang, 'storyWorkspaceCalls', { n: fmt(wsToolCalls) }) : ''
        }</p>
      `),
    )
  }

  // 8. 主力模型（阶段五：模型分布，缺失则跳屏）
  if (report.models.length > 0) {
    const top = report.models[0]
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyModelLead')}</p>
        <div class="big tool">${esc(top.model)}</div>
        <p class="tail">${t(lang, 'storyModelSub', { n: fmt(top.messages) })}</p>
      `),
    )
  }

  // 9. 深夜编码（阶段五：0-6 点占比，无调用或为零则跳屏）
  if (report.timeline.lateNightRatio !== null && report.timeline.lateNightRatio > 0) {
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyLateNightLead')}</p>
        <div class="big">${(report.timeline.lateNightRatio * 100).toFixed(1)}%</div>
        <p class="tail">${t(lang, 'storyLateNightSub')}</p>
      `),
    )
  }

  // 10. 最不稳定工具（阶段五：错误率最高且调用数足够，缺失则跳屏）
  const unstable = report.toolErrors.find((e) => e.calls >= 10)
  if (unstable) {
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'storyUnstableToolLead')}</p>
        <div class="big tool">${esc(unstable.name)}</div>
        <p class="tail">${t(lang, 'storyUnstableToolSub', {
          errors: fmt(unstable.errors),
          calls: fmt(unstable.calls),
          rate: (unstable.errorRate * 100).toFixed(1),
        })}</p>
      `),
    )
  }

  // 11. Token / 成本估算（tokens 缺失则跳屏；估算开启时替换为成本）
  if (tokens) {
    if (report.costEstimate) {
      screens.push(
        screen(`
          <p class="lead">${t(lang, 'costEstimate')}</p>
          <div class="big">${fmtCost(report.costEstimate.total)}</div>
          <p class="tail">${t(lang, 'storyTokenSub', {
            in: fmtTokens(tokens.input, lang),
            out: fmtTokens(tokens.output, lang),
          })}</p>
          <p class="note">${t(lang, 'costEstimateNote', {
            model: report.costEstimate.model,
            in: DEEPSEEK_PRICING.input,
            out: DEEPSEEK_PRICING.output,
          })}</p>
        `),
      )
    } else {
      screens.push(
        screen(`
          <p class="lead">${t(lang, 'storyTokenLead')}</p>
          <div class="big">${fmtTokens(tokens.input + tokens.output, lang)}</div>
          <p class="tail">${t(lang, 'storyTokenSub', {
            in: fmtTokens(tokens.input, lang),
            out: fmtTokens(tokens.output, lang),
          })}</p>
        `),
      )
    }
  }

  // 11.5 开发者人格（v1.2.0：personality 非空才显示）
  if (report.personality) {
    const p = report.personality
    screens.push(
      screen(`
        <p class="sub-title">${t(lang, 'personalityTitle')}</p>
        <div class="personality">
          <div class="p-icon">${PERSONALITY_ICONS[p.id] ?? '🧑‍💻'}</div>
          <div class="p-name">${esc(t(lang, personalityNameKey(p.id) as never))}</div>
          <p class="p-desc">${esc(t(lang, personalityDescKey(p.id) as never))}</p>
        </div>
      `),
    )
  }

  // 11.8 数据源分布（v1.2.0：--adapter all 多数据源时显示）
  if (report.adapterSources.length > 1) {
    const total = report.adapterSources.reduce((a, b) => a + b.sessions, 0)
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'sourceDistTitle')} · ${t(lang, 'sourceDistSub', { n: report.adapterSources.length })}</p>
        <div class="src-list">
          ${report.adapterSources
            .map((s) => {
              const label = s.source === 'claude-code' ? 'sourceClaudeCode' : 'sourceDsh'
              const pct = total > 0 ? Math.round((s.sessions / total) * 100) : 0
              return `<div class="src-row"><span class="src-label">${t(lang, label as never)}</span><span class="src-bar"><span class="src-fill" style="width:${pct}%"></span></span><span class="src-num">${fmt(s.sessions)} · ${pct}%</span></div>`
            })
            .join('')}
        </div>
      `),
    )
  }

  // 12. 成就徽章墙（v1.1.0：有达成徽章才显示；v1.3.0 等级角标 + 隐藏彩蛋）
  const earnedBadges = report.badges.filter((b) => b.earned)
  // 分母只统计常规徽章（隐藏彩蛋不计入总数）
  const regularTotal = report.badges.filter((b) => !b.hidden).length
  if (earnedBadges.length > 0) {
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'badgesTitle')} · ${t(lang, 'badgesSub', { n: earnedBadges.length, total: regularTotal })}</p>
        <div class="badge-grid">
          ${earnedBadges
            .map(
              (b) =>
                `<div class="badge"><div class="badge-icon">${BADGE_ICONS[b.id] ?? '🏅'}${b.level ? LEVEL_ICONS[b.level] : ''}</div><div class="badge-name">${esc(t(lang, badgeNameKey(b.id)))}</div></div>`,
            )
            .join('')}
        </div>
      `),
    )
  }

  // 12.5 逐月回放（v1.3.0：按月聚合 dailyActivity，每个月一屏迷你回顾）
  {
    const months = aggregateMonths(report.timeline.dailyActivity)
    for (const m of months) {
      screens.push(
        screen(`
          <p class="lead">${m.year} ${lang === 'zh' ? '年' : ''}${m.month}${lang === 'zh' ? ' 月' : ''}</p>
          <div class="big">${fmt(m.toolCalls)}</div>
          <p class="tail">${t(lang, 'storyMonthCalls')} · ${t(lang, 'storyMonthSessions', { n: m.sessions })}</p>
        `),
      )
    }
  }

  // 13. 年度对比（v1.1.0：--compare 且上一年有数据）
  if (report.yearComparison) {
    const cmp = report.yearComparison
    screens.push(
      screen(`
        <p class="lead">${t(lang, 'compareTitle')} · ${t(lang, 'compareSub', { cur: cmp.currentYear, prev: cmp.previousYear })}</p>
        <div class="cmp-list">
          ${cmp.metrics
            .map((m) => {
              const label = t(lang, compareMetricKey(m.key))
              const delta =
                m.delta === null
                  ? `<span class="delta new">${t(lang, 'compareNewStart')}</span>`
                  : `<span class="delta ${m.delta >= 0 ? 'up' : 'down'}">${m.delta >= 0 ? '+' : ''}${(m.delta * 100).toFixed(0)}%</span>`
              return `<div class="cmp-row"><span class="cmp-label">${label}</span><span class="cmp-nums">${fmt(m.previous)} → ${fmt(m.current)}</span>${delta}</div>`
            })
            .join('')}
        </div>
      `),
    )
  }

  // 尾屏
  // 总结页文件名：与 CLI 写入的 companion compact 文件保持一致（同目录相对链接）
  const summaryHref = `${reportBaseName(report)}-compact.html`
  screens.push(
    screen(`
      <p class="lead">${t(lang, 'storyFinalLead', { n: overview.activeDays })}</p>
      <div class="big">${fmt(overview.activeDays)}</div>
      <p class="tail">${t(lang, 'storyFinalSub')}</p>
      <a class="btn-summary" href="${summaryHref}">📊 ${t(lang, 'viewSummary')}</a>
      <footer>
        ${t(lang, 'footerGeneratedBy')} · ${t(lang, 'footerDataFrom', { source: dataSource })}<br>
        ${fmtDateTime(report.generatedAt)}
      </footer>
    `),
  )

  return `<!DOCTYPE html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  :root {
    --text: #f0efff; --muted: rgba(240,239,255,.72);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-snap-type: y mandatory; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    color: var(--text); background: #0f0c29;
  }
  /* 逐屏吸附：每屏满高、内容居中 */
  .screen {
    min-height: 100vh; scroll-snap-align: start; scroll-snap-stop: always;
    display: flex; align-items: center; justify-content: center;
    text-align: center; padding: 48px 24px; position: relative;
  }
  /* 五组主题渐变循环 */
  .s1 { background: linear-gradient(160deg, #0f0c29, #302b63); }
  .s2 { background: linear-gradient(160deg, #1a1040, #5b2a86); }
  .s3 { background: linear-gradient(160deg, #0c1b3a, #1d5d9c); }
  .s4 { background: linear-gradient(160deg, #2a0e2e, #833ab4); }
  .s5 { background: linear-gradient(160deg, #0f2f26, #17766a); }

  .reveal { opacity: 0; transform: translateY(28px); max-width: 860px; width: 100%; }
  .reveal.visible { opacity: 1; transform: none; transition: opacity .7s ease, transform .7s ease; }

  .kicker { letter-spacing: .45em; font-size: .8rem; color: var(--muted); margin-bottom: 14px; font-weight: 700; }
  h1 {
    font-size: clamp(2rem, 7vw, 3.6rem); font-weight: 900; letter-spacing: 1px;
    background: linear-gradient(90deg, #a78bfa, #6ee7ff);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .range { color: var(--muted); margin-top: 14px; font-size: 1rem; }
  .hint { position: absolute; bottom: 34px; left: 0; right: 0; color: var(--muted); font-size: .85rem; animation: bounce 1.8s infinite; }
  @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(8px); } }

  .lead { font-size: clamp(1.05rem, 3vw, 1.4rem); color: var(--muted); margin-bottom: 10px; }
  .big {
    font-size: clamp(3.6rem, 16vw, 8.5rem); font-weight: 900; line-height: 1.1;
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
    background: linear-gradient(90deg, #f5f3ff, #6ee7ff);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    word-break: break-all;
  }
  .big.tool { font-family: "JetBrains Mono", "Fira Code", Consolas, monospace; font-size: clamp(2.4rem, 9vw, 5rem); word-break: break-word; }
  .big.small-text { font-size: clamp(1.4rem, 5.5vw, 3rem); word-break: break-all; }
  .tail { margin-top: 14px; font-size: clamp(1rem, 3vw, 1.3rem); color: var(--text); }
  /* v1.2.2 总结页跳转按钮（尾屏） */
  .btn-summary {
    display: inline-block; margin-top: 26px; padding: 12px 28px;
    border-radius: 999px; text-decoration: none; font-weight: 700;
    font-size: clamp(.95rem, 2.8vw, 1.1rem);
    color: #fff; background: linear-gradient(90deg, #7c6cff, #4ecdc4);
    box-shadow: 0 4px 24px rgba(124,108,255,.4);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .btn-summary:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(124,108,255,.55); }
  .note { margin-top: 12px; font-size: .8rem; color: var(--muted); }
  footer { margin-top: 40px; font-size: .78rem; color: var(--muted); line-height: 1.8; }

  /* v1.2.0 开发者人格 */
  .personality { text-align: center; margin-top: 14px; }
  .p-icon { font-size: clamp(3rem, 10vw, 4.5rem); line-height: 1.2; }
  .p-name { margin-top: 10px; font-size: clamp(1.5rem, 5vw, 2.2rem); font-weight: 800; color: var(--text); }
  .p-desc { margin-top: 10px; font-size: clamp(.9rem, 2.8vw, 1.05rem); color: var(--muted); max-width: 30em; }

  /* v1.2.0 数据源分布 */
  .src-list { max-width: 520px; margin: 18px auto 0; text-align: left; }
  .src-row {
    display: flex; align-items: center; gap: 12px; padding: 10px 4px;
    border-bottom: 1px solid rgba(255,255,255,.1);
    font-size: clamp(.95rem, 2.6vw, 1.1rem);
  }
  .src-label { min-width: 110px; color: var(--text); }
  .src-bar { flex: 1; height: 8px; background: rgba(255,255,255,.12); border-radius: 4px; overflow: hidden; }
  .src-fill { display: block; height: 100%; background: linear-gradient(90deg, #7c6cff, #4ecdc4); }
  .src-num { min-width: 110px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

  /* v1.1.0 徽章墙 */
  .badge-grid {
    display: flex; flex-wrap: wrap; gap: 14px; justify-content: center;
    max-width: 640px; margin: 18px auto 0;
  }
  .badge {
    background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
    border-radius: 14px; padding: 14px 18px; min-width: 104px;
  }
  .badge-icon { font-size: 2rem; line-height: 1.2; }
  .badge-name { margin-top: 6px; font-size: .9rem; color: var(--text); }

  /* v1.1.0 年度对比 */
  .cmp-list { max-width: 560px; margin: 18px auto 0; text-align: left; }
  .cmp-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 4px; border-bottom: 1px solid rgba(255,255,255,.1);
    font-size: clamp(.95rem, 2.6vw, 1.1rem);
  }
  .cmp-label { color: var(--muted); }
  .cmp-nums { font-variant-numeric: tabular-nums; }
  .delta { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 64px; text-align: right; }
  .delta.up { color: #6ee7a0; }
  .delta.down { color: #ff9e9e; }
  .delta.new { color: #ffd479; font-size: .85em; }
</style>
</head>
<body>
${screens.join('\n')}
<script>
  // 进入视口渐入：纯 CSS animation 无法响应滚动，IntersectionObserver 按屏触发
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('visible')
      }
    },
    { threshold: 0.35 },
  )
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
</script>
</body>
</html>`
}

/** 写入 story 报告文件，返回文件绝对路径 */
export async function writeStoryReport(
  report: DevWrappedReport,
  outputDir: string,
  lang: Lang = 'zh',
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `${reportBaseName(report)}.html`)
  await fs.writeFile(filePath, toStoryReport(report, lang), 'utf8')
  return filePath
}
