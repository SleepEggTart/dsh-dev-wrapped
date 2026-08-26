/**
 * Cordis 插件壳 + 库导出
 *
 * v1 保持最小实现（不安装任何 @deepseek-ai/* 私有包，ctx 用 unknown 保证 tsc 通过）。
 * 统计与报告能力通过库导出提供，CLI 入口见 bin/dsh-dev-wrapped.mjs。
 */
export const name = 'dsh-dev-wrapped'

export function apply(_ctx: unknown): void {
  // 预留：注册 devWrapped 服务；v1 保持最小实现
}

// ---------- 库导出 ----------
export type * from './types.js'
export { DshAdapter, TOOL_CATEGORIES, toolCategory } from './adapters/dsh.js'
export type { DshSessionHeader } from './adapters/dsh.js'
export { aggregate } from './stats/index.js'
export type { StatsOptions } from './stats/index.js'
export { toJsonReport, writeJsonReport, localDateKey, reportBaseName } from './report/json.js'
export { toHtmlReport, writeHtmlReport } from './report/html.js'
export { runCli, parseArgs, parseDateArg } from './cli.js'
export type { CliOptions } from './cli.js'
