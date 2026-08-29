/** Cordis 命令的最小结构（宿主真实类型为完整 Command 对象） */
interface MinimalCommand {
    action(fn: (argv: string[]) => Promise<number | void> | number | void): MinimalCommand | unknown;
}
/**
 * DSH 斜杠命令执行结果（@deepseek-ai/dsh-commands 的 CommandResult 子集）
 * handler 返回的 text 由 UI 直接渲染，不进入模型上下文
 */
interface SlashCommandResult {
    kind: 'success' | 'error';
    text?: string;
}
/** DSH 斜杠命令注册表的最小结构（宿主真实类型为 CommandRuntime） */
interface MinimalCommandsService {
    register(definition: {
        /** 小写命令名（不含斜杠） */
        name: string;
        /** 发现 UI 中展示的说明 */
        description: string;
        /** 可选的自由输入提示 */
        input?: {
            hint: string;
        };
        /** 执行处理器：rawInput 为命令名后的原文参数 */
        handler: (invocation: {
            rawInput: string;
            signal: AbortSignal;
        }) => SlashCommandResult | Promise<SlashCommandResult>;
    }): () => void;
}
/** Cordis Context 最小结构（结构化子集，仅声明本插件用到的成员） */
export interface MinimalContext {
    command?(name: string, description: string): MinimalCommand;
    /** DSH 斜杠命令注册表（@deepseek-ai/dsh-commands 提供的 ctx.commands） */
    commands?: MinimalCommandsService;
    logger?(): {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
    };
}
export declare const name = "dsh-dev-wrapped";
export declare const usage = "\u751F\u6210\u4F60\u7684 AI \u7F16\u7801\u5E74\u5EA6\u62A5\u544A\uFF1A\u5BF9\u8BDD\u6846\u8F93\u5165 /wrapped [\u9009\u9879]\uFF08\u9009\u9879\u4E0E CLI \u4E00\u81F4\uFF0C\u5982 /wrapped --adapter all\uFF09";
export declare function apply(ctx: unknown): void;
export type * from './types.js';
export { DshAdapter, TOOL_CATEGORIES, toolCategory } from './adapters/dsh.js';
export type { DshSessionHeader } from './adapters/dsh.js';
export { ClaudeCodeAdapter } from './adapters/claude-code.js';
export { aggregate } from './stats/index.js';
export type { StatsOptions } from './stats/index.js';
export { toJsonReport, writeJsonReport, localDateKey, reportBaseName } from './report/json.js';
export { toHtmlReport, writeHtmlReport } from './report/html.js';
export { toStoryReport, writeStoryReport } from './report/story.js';
export { runCli, parseArgs, parseDateArg } from './cli.js';
export type { CliOptions } from './cli.js';
