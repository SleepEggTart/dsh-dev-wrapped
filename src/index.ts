/**
 * Cordis 插件壳 + 库导出
 *
 * 不安装任何 @deepseek-ai/* 私有包：在此声明 Cordis Context 的最小结构接口
 * （command / logger），运行时由宿主注入真实 ctx；字段不匹配时安全降级，
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

/** Cordis Context 最小结构（结构化子集，仅声明本插件用到的成员） */
export interface MinimalContext {
  command?(name: string, description: string): MinimalCommand
  logger?(): { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
}

export const name = 'dsh-dev-wrapped'

export const usage = '生成你的 AI 编码年度报告：dev.wrapped [选项]（选项与 CLI 一致）'

/** 插件应用入口：注册 dev.wrapped 命令渲染报告 */
export function apply(ctx: unknown): void {
  // 结构探测而非类型断言：宿主不是 Cordis（或版本不兼容）时安全跳过
  const c = ctx as Partial<MinimalContext>
  if (typeof c.command !== 'function') return
  const logger =
    typeof c.logger === 'function'
      ? c.logger()
      : { info: console.log, warn: console.warn, error: console.error }

  c.command('dev.wrapped', '生成 DSH/Claude Code 开发回顾报告')?.action(async (argv: string[]) => {
    try {
      // 聊天环境无法应答终端交互菜单：未显式传 --adapter 时注入默认 dsh，
      // 需要其他数据源请在命令后带参数（如 dev.wrapped --adapter all）
      const args = Array.isArray(argv) ? argv : []
      const effective = args.includes('--adapter') ? args : ['--adapter', 'dsh', ...args]
      // 复用 CLI 主流程：参数解析、扫描、聚合、报告落盘与自动打开
      const code = await runCli(effective)
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
