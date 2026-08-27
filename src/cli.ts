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
import { ZstdUnavailableError } from './parser/zstd.js'
import type { NormalizedEvent, SessionAdapter } from './types.js'

/** 用法说明 */
const USAGE = `用法: dsh-dev-wrapped [选项]

选项:
  --adapter <id>           数据源适配器: dsh（默认）/ claude-code / auto（自动检测）
  --dsh-home <path>        DSH 数据目录（默认 ~/.dsh）
  --claude-home <path>     Claude Code 数据目录（默认 ~/.claude）
  --output <dir>           输出目录（默认 ./reports）
  --json                   只输出 JSON，不生成 HTML
  --since <YYYY-MM-DD>     起始日期（含），按会话 createdAt 本地时区过滤
  --until <YYYY-MM-DD>     结束日期（含）
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
  try {
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

  const dshHome = opts.dshHome ?? path.join(os.homedir(), '.dsh')
  const claudeHome = opts.claudeHome ?? path.join(os.homedir(), '.claude')
  const outputDir = opts.output ?? './reports'

  // ---------- 适配器选择 ----------
  let adapter: SessionAdapter
  let dataRoot: string
  const adapterArg = opts.adapter ?? 'dsh'
  if (adapterArg === 'dsh') {
    adapter = new DshAdapter()
    dataRoot = dshHome
  } else if (adapterArg === 'claude-code') {
    adapter = new ClaudeCodeAdapter()
    dataRoot = claudeHome
  } else if (adapterArg === 'auto') {
    // 自动检测：两个数据目录都存在时默认 DSH 并提示显式指定
    const hasDsh = await dirExists(path.join(dshHome, 'sessions'))
    const hasClaude = await dirExists(path.join(claudeHome, 'projects'))
    if (hasDsh && hasClaude) {
      console.log('ℹ️ 同时检测到 DSH 与 Claude Code 数据目录，默认使用 DSH；如需扫描 Claude Code 请显式指定 --adapter claude-code')
      adapter = new DshAdapter()
      dataRoot = dshHome
    } else if (hasClaude) {
      adapter = new ClaudeCodeAdapter()
      dataRoot = claudeHome
    } else if (hasDsh) {
      adapter = new DshAdapter()
      dataRoot = dshHome
    } else {
      console.log(`📂 未找到任何会话数据（${dshHome}/sessions 与 ${claudeHome}/projects 均不存在）`)
      return 0
    }
  } else {
    console.error(`✖ 无效的 --adapter 值: ${adapterArg}（可选 dsh / claude-code / auto）\n`)
    console.error(USAGE)
    return 1
  }

  // 适配器展示名（扫描提示与报告标题用）
  const adapterLabel = adapter.id === 'claude-code' ? 'Claude Code' : 'DSH'
  const title = `${adapterLabel} Dev Wrapped`

  console.log(`🔍 扫描 ${adapterLabel} 会话数据...`)
  const files = await adapter.scan(dataRoot)
  if (files.length === 0) {
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

  console.log('⏳ 解析中...')
  const events: NormalizedEvent[] = []
  for (const f of files) {
    try {
      await adapter.parse(f, (e) => events.push(e))
    } catch (err) {
      if (err instanceof ZstdUnavailableError) {
        // zstd 与 fzstd 均不可用：提示安装后以非 0 退出
        console.error(`✖ ${err.message}`)
        return 1
      }
      // 单文件失败（zstd 损坏等）：警告并跳过，不中断全局
      console.error(`⚠ 跳过无法解析的会话: ${f.filePath} — ${(err as Error).message}`)
    }
  }

  console.log('📊 生成报告...')
  const report = aggregate(events, { includeSubagents: opts.includeSubagents, since, until })
  // 数据根目录与适配器标识由 CLI 层覆盖（aggregate 默认按 DSH 填充）
  report.dshHome = dataRoot
  report.adapterId = adapter.id

  if (report.overview.totalSessions === 0) {
    console.log('📂 指定范围内没有会话数据')
    return 0
  }

  // ---------- 汇总输出 ----------
  const startDate = localDateKey(report.timeRange.start)
  const endDate = localDateKey(report.timeRange.end)
  const top5 = report.toolUsage
    .slice(0, 5)
    .map((t) => t.name)
    .join(' · ')
  const sep = '═'.repeat(39)
  console.log(sep)
  console.log(`  ${title}`)
  console.log(`  ${startDate} → ${endDate}（${report.timeRange.days} 天）`)
  console.log(sep)
  console.log(`  ${padEnd('会话总数', 12)}${report.overview.totalSessions.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('对话轮数', 12)}${report.overview.totalTurns.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('工具调用', 12)}${report.overview.totalToolCalls.toLocaleString('zh-CN')}`)
  console.log(`  ${padEnd('活跃天数', 12)}${report.overview.activeDays.toLocaleString('zh-CN')}`)
  if (top5) console.log(`  ${padEnd('TOP 5 工具', 12)}${top5}`)

  // ---------- 落盘 ----------
  if (!opts.json) {
    const htmlPath = await writeHtmlReport(report, outputDir)
    const absHtml = path.resolve(htmlPath)
    console.log(`📄 报告已保存: ${absHtml}`)
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
