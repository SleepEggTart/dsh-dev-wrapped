/**
 * Cordis 插件壳 + 库导出
 *
 * 不安装任何 @deepseek-ai/* 私有包：在此声明 Cordis Context 的最小结构接口
 * （command / commands / logger），运行时由宿主注入真实 ctx；字段不匹配时安全降级，
 * 不影响作为纯库 / CLI 使用。
 * 统计与报告能力通过库导出提供，CLI 入口见 bin/dsh-dev-wrapped.mjs。
 */
import { runCli } from './cli.js'

/** Cordis 命令的最小结构（宿主真实类型为完整 Command 对象） */
interface MinimalCommand {
  action(
    fn: (argv: string[]) => Promise<number | void> | number | void,
  ): MinimalCommand | unknown
}

/**
 * DSH 斜杠命令执行结果（@deepseek-ai/dsh-commands 的 CommandResult 子集）
 * handler 返回的 text 由 UI 直接渲染，不进入模型上下文
 */
interface SlashCommandResult {
  kind: 'success' | 'error'
  text?: string
}

/** DSH 斜杠命令注册表的最小结构（宿主真实类型为 CommandRuntime） */
interface MinimalCommandsService {
  register(definition: {
    /** 小写命令名（不含斜杠） */
    name: string
    /** 发现 UI 中展示的说明 */
    description: string
    /** 可选的自由输入提示 */
    input?: { hint: string }
    /** 执行处理器：rawInput 为命令名后的原文参数 */
    handler: (invocation: {
      rawInput: string
      signal: AbortSignal
    }) => SlashCommandResult | Promise<SlashCommandResult>
  }): () => void
}

/** Cordis Context 最小结构（结构化子集，仅声明本插件用到的成员） */
export interface MinimalContext {
  command?(name: string, description: string): MinimalCommand
  /** DSH 斜杠命令注册表（@deepseek-ai/dsh-commands 提供的 ctx.commands） */
  commands?: MinimalCommandsService
  logger?(): { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
}

export const name = 'dsh-dev-wrapped'

export const usage =
  '生成你的 AI 编码年度报告：对话框输入 /wrapped [选项]（选项与 CLI 一致，如 /wrapped --adapter all）'

export function apply(ctx: unknown): void {
  // 结构探测而非类型断言：宿主不是 Cordis（或版本不兼容）时安全跳过
  const c = ctx as Partial<MinimalContext>
  const logger =
    typeof c.logger === 'function'
      ? c.logger()
      : { info: console.log, warn: console.warn, error: console.error }

  /**
   * 组装有效参数：聊天环境无法应答终端交互菜单，
   * 未显式传 --adapter 时注入默认 dsh（用户可用 /wrapped --adapter all 覆盖）
   */
  const buildArgs = (raw: string): string[] => {
    const args = raw.trim().split(/\s+/).filter(Boolean)
    return args.includes('--adapter') ? args : ['--adapter', 'dsh', ...args]
  }

  // ---------- 斜杠命令 /wrapped（DSH 官方 commands 服务，优先） ----------
  if (c.commands && typeof c.commands.register === 'function') {
    c.commands.register({
      name: 'wrapped',
      description: '生成 DSH/Claude Code 开发回顾报告（Spotify Wrapped 风格）',
      input: { hint: '可选参数，如 --adapter all --year 2026 --compact' },
      handler: async ({ rawInput }) => {
        try {
          const code = await runCli(buildArgs(rawInput))
          if (code === 0) {
            return {
              kind: 'success',
              text: '报告已生成 ✅ 已自动在浏览器打开；文件在当前目录 ./reports/ 下（HTML 报告 + JSON 数据 + AI 总结 prompt）',
            }
          }
          return { kind: 'error', text: `报告生成失败（退出码 ${code}），详情见 DSH 终端日志` }
        } catch (err) {
          return { kind: 'error', text: `报告生成失败: ${(err as Error).message}` }
        }
      },
    })
    logger.info('dsh-dev-wrapped 已加载：在 DSH 对话框输入 /wrapped 生成回顾报告')
    return
  }

  // ---------- 传统 Cordis 命令 dev.wrapped（无 commands 服务的环境兜底） ----------
  if (typeof c.command !== 'function') return
  c.command('dev.wrapped', '生成 DSH/Claude Code 开发回顾报告')?.action(async (argv: string[]) => {
    try {
      const args = Array.isArray(argv) ? argv : []
      const code = await runCli(buildArgs(Array.isArray(args) ? args.join(' ') : ''))
      return code
    } catch (err) {
      logger.error(`报告生成失败: ${(err as Error).message}`)
      return 1
    }
  })

  logger.info('dsh-dev-wrapped 已加载：在 DSH 中发送 dev.wrapped 生成回顾报告')
}

// ---------- 库导出 ----------
export type * from './types.js'
export { DshAdapter, TOOL_CATEGORIES, toolCategory } from './adapters/dsh.js'
export type { DshSessionHeader } from './adapters/dsh.js'
export { ClaudeCodeAdapter } from './adapters/claude-code.js'
export { aggregate } from './stats/index.js'
export type { StatsOptions } from './stats/index.js'
export { toJsonReport, writeJsonReport, localDateKey, reportBaseName } from './report/json.js'
export { toHtmlReport, writeHtmlReport } from './report/html.js'
export { toStoryReport, writeStoryReport } from './report/story.js'
export { runCli, parseArgs, parseDateArg } from './cli.js'
export type { CliOptions } from './cli.js'
