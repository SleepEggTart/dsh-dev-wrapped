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
import { t } from '../i18n.js'
import { DEEPSEEK_PRICING, fmtCost } from '../cost.js'
import { esc, fmt, fmtDuration, fmtTokens, fmtDateTime } from './format.js'
import { localDateKey, reportBaseName } from './json.js'

/** 报告标题（品牌名或年度回顾，compact 与 story 共用口径） */
export function reportTitle(report: DevWrappedReport, lang: Lang): string {
  if (report.yearMode !== undefined) {
    return t(lang, 'yearTitle', { year: report.yearMode })
  }
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
    report.adapterId === 'claude-code' ? 'dataSourceClaude' : 'dataSourceDsh',
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

  // 8. Token / 成本估算（tokens 缺失则跳屏；估算开启时替换为成本）
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

  // 9. 尾屏
  screens.push(
    screen(`
      <p class="lead">${t(lang, 'storyFinalLead', { n: overview.activeDays })}</p>
      <div class="big">${fmt(overview.activeDays)}</div>
      <p class="tail">${t(lang, 'storyFinalSub')}</p>
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
  .note { margin-top: 12px; font-size: .8rem; color: var(--muted); }
  footer { margin-top: 40px; font-size: .78rem; color: var(--muted); line-height: 1.8; }
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
