/**
 * CLI 主逻辑：参数解析、扫描进度、汇总输出、报告落盘
 */
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { exec } from 'node:child_process'
import { DshAdapter } from './adapters/dsh.js'
import { ClaudeCodeAdapter } from './adapters/claude-code.js'
import { aggregate } from './stats/index.js'
import { writeJsonReport, localDateKey } from './report/json.js'
import { writeHtmlReport } from './report/html.js'
import { writeStoryReport, reportTitle } from './report/story.js'
import { estimateCost, fmtCost } from './cost.js'
import { ZstdUnavailableError } from './parser/zstd.js'
import type { Lang } from './i18n.js'
import type { DevWrappedReport, NormalizedEvent, SessionAdapter, YearCompareMetric } from './types.js'

/** 用法说明 */
const USAGE = `用法: dsh-dev-wrapped [选项]

选项:
  --adapter <id>           数据源适配器: dsh（默认）/ claude-code / all（合并两个数据源）/ auto（自动检测）
  --dsh-home <path>        DSH 数据目录（默认 ~/.dsh）
  --claude-home <path>     Claude Code 数据目录（默认 ~/.claude）
  --output <dir>           输出目录（默认 ./reports）
  --json                   只输出 JSON，不生成 HTML
  --compact                紧凑单页报告（默认为逐屏滚动叙事模式）
  --year <YYYY>            年度回顾：等价于该年 1-1 ~ 12-31 的日期过滤
  --compare                年度对比：配合 --year（缺省为当前年份），对比该年与上一年
  --lang <zh|en>           报告语言（默认 zh）
  --estimate-cost          按 DeepSeek 单价估算成本（基于真实 token，标注"估算"）
  --since <YYYY-MM-DD>     起始日期（含），按会话 createdAt 本地时区过滤；与 --year 互斥
  --until <YYYY-MM-DD>     结束日期（含）；与 --year 互斥
  --include-subagents      并入子代理会话的工具调用统计
  --help, -h               显示帮助
`

/** CLI 选项 */
export interface CliOptions {
  adapter?: string
  dshHome?: string
  claudeHome?: string
  output?: string
  json?: boolean
  compact?: boolean
  year?: string
  compare?: boolean
  lang?: string
  estimateCost?: boolean
  since?: string
  until?: string
  includeSubagents?: boolean
  help?: boolean
}

/** 手动解析命令行参数（零依赖）；非法参数抛错 */
export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--help':
      case '-h':
        opts.help = true
        break
      case '--json':
        opts.json = true
        break
      case '--include-subagents':
        opts.includeSubagents = true
        break
      case '--compact':
        opts.compact = true
        break
      case '--compare':
        opts.compare = true
        break
      case '--estimate-cost':
        opts.estimateCost = true
        break
      case '--year': {
        const v = takeValue(argv, i, a)
        opts.year = v.value
        i = v.next
        break
      }
      case '--lang': {
        const v = takeValue(argv, i, a)
        opts.lang = v.value
        i = v.next
        break
      }
      case '--dsh-home': {
        const v = takeValue(argv, i, a)
        opts.dshHome = v.value
        i = v.next
        break
      }
      case '--claude-home': {
        const v = takeValue(argv, i, a)
        opts.claudeHome = v.value
        i = v.next
        break
      }
      case '--adapter': {
        const v = takeValue(argv, i, a)
        opts.adapter = v.value
        i = v.next
        break
      }
      case '--output': {
        const v = takeValue(argv, i, a)
        opts.output = v.value
        i = v.next
        break
      }
      case '--since': {
        const v = takeValue(argv, i, a)
        opts.since = v.value
        i = v.next
        break
      }
      case '--until': {
        const v = takeValue(argv, i, a)
        opts.until = v.value
        i = v.next
        break
      }
      default:
        throw new Error(`未知选项: ${a}`)
    }
  }
  return opts
}

/** 取带值选项的值与下一索引 */
function takeValue(argv: string[], i: number, name: string): { value: string; next: number } {
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('--')) {
    throw new Error(`选项 ${name} 缺少参数值`)
  }
  return { value: v, next: i + 1 }
}

/** 解析 YYYY-MM-DD 为本地时区时间戳；startOfDay=true 取 00:00:00.000，否则 23:59:59.999 */
export function parseDateArg(s: string, kind: string, startOfDay: boolean): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) {
    throw new Error(`无效的 ${kind} 日期: "${s}"（应为 YYYY-MM-DD）`)
  }
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > 31) {
    throw new Error(`无效的 ${kind} 日期: "${s}"`)
  }
  const date = startOfDay
    ? new Date(y, mo, d, 0, 0, 0, 0)
    : new Date(y, mo, d, 23, 59, 59, 999)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的 ${kind} 日期: "${s}"`)
  }
  return date.getTime()
}

/** 中日韩字符按 2 列计的显示宽度 */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1
  }
  return w
}

/** 按显示宽度右侧补空格（终端对齐中文标签用） */
function padEnd(s: string, width: number): string {
  const pad = width - displayWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

/** 判断目录是否存在（auto 适配器检测数据目录用） */
async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory()
  } catch {
    return false
  }
}

/** 构造年度对比指标：sessions / turns / toolCalls / activeDays（tokens 双方完整时追加） */
function buildCompareMetrics(cur: DevWrappedReport, prev: DevWrappedReport): YearCompareMetric[] {
  const mk = (key: string, current: number, previous: number): YearCompareMetric => ({
    key,
    current,
    previous,
    // 上一年为 0 时无法计算百分比（本年 > 0 视为全新起步），delta 记 null
    delta: previous > 0 ? Math.round(((current - previous) / previous) * 10_000) / 10_000 : null,
  })
  const metrics = [
    mk('sessions', cur.overview.totalSessions, prev.overview.totalSessions),
    mk('turns', cur.overview.totalTurns, prev.overview.totalTurns),
    mk('toolCalls', cur.overview.totalToolCalls, prev.overview.totalToolCalls),
    mk('activeDays', cur.overview.activeDays, prev.overview.activeDays),
  ]
  if (cur.overview.tokens && prev.overview.tokens) {
    metrics.push(
      mk(
        'tokens',
        cur.overview.tokens.input + cur.overview.tokens.output,
        prev.overview.tokens.input + prev.overview.tokens.output,
      ),
    )
  }
  return metrics
}

/** CLI 主入口；返回进程退出码 */
export async function runCli(argv: string[]): Promise<number> {
  let opts: CliOptions
  try {
    opts = parseArgs(argv)
  } catch (err) {
    console.error(`✖ ${(err as Error).message}\n`)
    console.error(USAGE)
    return 1
  }
  if (opts.help) {
    console.log(USAGE)
    return 0
  }

  // 日期参数（本地时区解释）
  let since: number | undefined
  let until: number | undefined
  // 年度模式：等价于该年 1-1 ~ 12-31；与 --since/--until 互斥
  let yearMode: number | undefined
  try {
    if (opts.compare) {
      // 年度对比必须基于年度范围；未指定 --year 时默认当前年份
      if (opts.since !== undefined || opts.until !== undefined) {
        console.error('✖ --compare 不能与 --since / --until 同时使用（年度对比基于整年范围）')
        return 1
      }
    }
    if (opts.year !== undefined) {
      if (opts.since !== undefined || opts.until !== undefined) {
        console.error('✖ --year 不能与 --since / --until 同时使用')
        return 1
      }
      if (!/^\d{4}$/.test(opts.year) || Number(opts.year) < 1970 || Number(opts.year) > 2100) {
        throw new Error(`无效的 --year 值: "${opts.year}"（应为 1970-2100 的四位数年份）`)
      }
      yearMode = Number(opts.year)
      since = parseDateArg(`${yearMode}-01-01`, '--year', true)
      until = parseDateArg(`${yearMode}-12-31`, '--year', false)
    } else if (opts.compare) {
      yearMode = new Date().getFullYear()
      since = parseDateArg(`${yearMode}-01-01`, '--year', true)
      until = parseDateArg(`${yearMode}-12-31`, '--year', false)
    }
    if (opts.since !== undefined) since = parseDateArg(opts.since, '--since', true)
    if (opts.until !== undefined) until = parseDateArg(opts.until, '--until', false)
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`)
    return 1
  }
  if (since !== undefined && until !== undefined && since > until) {
    console.error('✖ --since 不能晚于 --until')
    return 1
  }

  // 报告语言（默认中文）
  if (opts.lang !== undefined && opts.lang !== 'zh' && opts.lang !== 'en') {
    console.error(`✖ 无效的 --lang 值: ${opts.lang}（可选 zh / en）\n`)
    console.error(USAGE)
    return 1
  }
  const lang: Lang = opts.lang === 'en' ? 'en' : 'zh'

  const dshHome = opts.dshHome ?? path.join(os.homedir(), '.dsh')
  const claudeHome = opts.claudeHome ?? path.join(os.homedir(), '.claude')
  const outputDir = opts.output ?? './reports'

  // ---------- 适配器选择 ----------
  /** 待扫描的适配器 × 数据根目录组合（--adapter all 时为两个） */
  let targets: Array<{ adapter: SessionAdapter; dataRoot: string }>
  const adapterArg = opts.adapter ?? 'dsh'
  if (adapterArg === 'dsh') {
    targets = [{ adapter: new DshAdapter(), dataRoot: dshHome }]
  } else if (adapterArg === 'claude-code') {
    targets = [{ adapter: new ClaudeCodeAdapter(), dataRoot: claudeHome }]
  } else if (adapterArg === 'all') {
    // 跨数据源合并：两个适配器同时扫描，事件流合并后统一聚合
    targets = [
      { adapter: new DshAdapter(), dataRoot: dshHome },
      { adapter: new ClaudeCodeAdapter(), dataRoot: claudeHome },
    ]
  } else if (adapterArg === 'auto') {
    // 自动检测：两个数据目录都存在时默认 DSH 并提示显式指定
    const hasDsh = await dirExists(path.join(dshHome, 'sessions'))
    const hasClaude = await dirExists(path.join(claudeHome, 'projects'))
    if (hasDsh && hasClaude) {
      console.log('ℹ️ 同时检测到 DSH 与 Claude Code 数据目录，默认使用 DSH；合并扫描请使用 --adapter all')
      targets = [{ adapter: new DshAdapter(), dataRoot: dshHome }]
    } else if (hasClaude) {
      targets = [{ adapter: new ClaudeCodeAdapter(), dataRoot: claudeHome }]
    } else if (hasDsh) {
      targets = [{ adapter: new DshAdapter(), dataRoot: dshHome }]
    } else {
      console.log(`📂 未找到任何会话数据（${dshHome}/sessions 与 ${claudeHome}/projects 均不存在）`)
      return 0
    }
  } else {
    console.error(`✖ 无效的 --adapter 值: ${adapterArg}（可选 dsh / claude-code / all / auto）\n`)
    console.error(USAGE)
    return 1
  }

  // ---------- 逐适配器扫描与解析 ----------
  const events: NormalizedEvent[] = []
  let scannedFiles = 0
  for (const { adapter, dataRoot } of targets) {
    const adapterLabel = adapter.id === 'claude-code' ? 'Claude Code' : 'DSH'
    console.log(`🔍 扫描 ${adapterLabel} 会话数据...`)
    let files
    try {
      files = await adapter.scan(dataRoot)
    } catch (err) {
      // 目录不存在等情况：all 模式下跳过该数据源，单数据源模式报错退出
      if (adapterArg === 'all') {
        console.log(`ℹ️ 已跳过 ${adapterLabel}：${(err as Error).message}`)
        continue
      }
      throw err
    }
    if (files.length === 0) {
      if (adapterArg === 'all') {
        console.log(`ℹ️ ${adapterLabel} 无会话数据，已跳过`)
        continue
      }
      console.log(`📂 未在 ${dataRoot} 找到 ${adapterLabel} 会话数据`)
      console.log(
        adapter.id === 'claude-code'
          ? '   请确认目录正确；会话通常存储在 ~/.claude/projects'
          : '   请确认目录正确；会话通常存储在 ~/.dsh/sessions',
      )
      return 0
    }

    // 窥探会话头：统计主/子代理数与工作目录数（适配器未实现时跳过）
    const headers = adapter.peekSessionHeader
      ? await Promise.all(files.map((f) => adapter.peekSessionHeader!(f)))
      : []
    const valid = headers.filter((h): h is NonNullable<typeof h> => h !== null)
    if (valid.length > 0) {
      const mainCount = valid.filter((h) => h.origin === 'main').length
      const subCount = valid.length - mainCount
      const wsCount = new Set(valid.map((h) => h.cwd)).size
      console.log(
        `📂 发现 ${mainCount} 个主会话（另有 ${subCount} 个子代理会话，默认排除），${wsCount} 个工作目录`,
      )
    } else {
      console.log(`📂 发现 ${files.length} 个会话文件（会话头不可读，将在解析时逐个确认）`)
    }

    scannedFiles += files.length
    console.log('⏳ 解析中...')
    for (const f of files) {
      try {
        await adapter.parse(f, (e) => events.push(e))
      } catch (err) {
        if (err instanceof ZstdUnavailableError) {
          // zstd 与 fzstd 均不可用：输出平台感知的安装指引后退出
          console.error(`✖ ${err.message}：\n${err.installHint()}`)
          return 1
        }
        // 单文件失败（zstd 损坏等）：警告并跳过，不中断全局
        console.error(`⚠ 跳过无法解析的会话: ${f.filePath} — ${(err as Error).message}`)
      }
    }
  }
  if (scannedFiles === 0) {
    console.log('📂 所有数据源均无会话数据')
    return 0
  }

  console.log('📊 生成报告...')
  const report = aggregate(events, { includeSubagents: opts.includeSubagents, since, until })
  // 数据根目录、适配器标识与年度模式由 CLI 层覆盖（aggregate 默认按 DSH 填充）
  // all 模式 adapterId 用 'all' 标识（reportTitle 据此显示合并标题），dshHome 取第一个数据根
  report.dshHome = targets[0].dataRoot
  report.adapterId = adapterArg === 'all' ? 'all' : targets[0].adapter.id
  if (yearMode !== undefined) report.yearMode = yearMode

  // 成本估算：显式开启且 tokens 完整时计算（tokens 缺失则提示跳过，绝不估算 token）
  if (opts.estimateCost) {
    if (report.overview.tokens) {
      report.costEstimate = estimateCost(report.overview.tokens)
    } else {
      console.log('ℹ️ 已跳过成本估算：本批会话缺少 token 用量记录')
    }
  }

  // 年度对比：--compare 开启时对上一年再聚合一次（events 已全量在内存，零解析成本）
  if (opts.compare && yearMode !== undefined) {
    const prevYear = yearMode - 1
    const prevReport = aggregate(events, {
      includeSubagents: opts.includeSubagents,
      since: parseDateArg(`${prevYear}-01-01`, '--year', true),
      until: parseDateArg(`${prevYear}-12-31`, '--year', false),
    })
    if (prevReport.overview.totalSessions === 0) {
      console.log(`ℹ️ 已跳过年度对比：${prevYear} 年没有会话数据`)
    } else {
      report.yearComparison = {
        currentYear: yearMode,
        previousYear: prevYear,
        metrics: buildCompareMetrics(report, prevReport),
      }
    }
  }

  if (report.overview.totalSessions === 0) {
    console.log('📂 指定范围内没有会话数据')
    return 0
  }

  // ---------- 汇总输出 ----------
  const startDate = localDateKey(report.timeRange.start)
  const endDate = localDateKey(report.timeRange.end)
  const top5 = report.toolUsage
    .slice(0, 5)
    .map((tool) => tool.name)
    .join(' · ')
  const sep = '═'.repeat(39)
  console.log(sep)
  console.log(`  ${reportTitle(report, lang)}`)
  console.log(`  ${startDate} → ${endDate}（${report.timeRange.days} 天）`)
  console.log(sep)
  console.log(`  ${padEnd('会话总数', 12)}${report.overview.totalSessions.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('对话轮数', 12)}${report.overview.totalTurns.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('工具调用', 12)}${report.overview.totalToolCalls.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('活跃天数', 12)}${report.overview.activeDays.toLocaleString('zh-CN')}`)
  if (top5) console.log(`  ${padEnd('TOP 5 工具', 12)}${top5}`)
  if (report.costEstimate) {
    console.log(`  ${padEnd('成本估算', 12)}${fmtCost(report.costEstimate.total)}（估算值）`)
  }

  // ---------- 落盘 ----------
  if (!opts.json) {
    // 默认逐屏滚动叙事模式；--compact 输出紧凑单页
    const htmlPath = opts.compact
      ? await writeHtmlReport(report, outputDir, lang)
      : await writeStoryReport(report, outputDir, lang)
    const absHtml = path.resolve(htmlPath)
    console.log(`📄 报告已保存: ${absHtml}${opts.compact ? '' : '（story 模式，--compact 可切换单页）'}`)
    // 自动用默认浏览器打开 HTML 报告
    const openCmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    exec(`${openCmd} "${absHtml}"`, (err) => {
      if (err) console.error(`⚠ 无法自动打开浏览器: ${err.message}`)
    })
  }
  const jsonPath = await writeJsonReport(report, outputDir)
  console.log(`📋 JSON 数据:   ${path.resolve(jsonPath)}`)
  return 0
}
