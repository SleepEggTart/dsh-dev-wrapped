/** CLI 选项 */
export interface CliOptions {
    adapter?: string;
    dshHome?: string;
    claudeHome?: string;
    output?: string;
    json?: boolean;
    compact?: boolean;
    year?: string;
    compare?: boolean;
    lang?: string;
    estimateCost?: boolean;
    since?: string;
    until?: string;
    includeSubagents?: boolean;
    help?: boolean;
}
/** 手动解析命令行参数（零依赖）；非法参数抛错 */
export declare function parseArgs(argv: string[]): CliOptions;
/** 解析 YYYY-MM-DD 为本地时区时间戳；startOfDay=true 取 00:00:00.000，否则 23:59:59.999 */
export declare function parseDateArg(s: string, kind: string, startOfDay: boolean): number;
/**
 * 解析交互菜单输入：'1'/'2'/'3' → 对应数据源；空输入 → null（用默认）
 * 导出供单测使用（非法输入也返回 null）
 */
export declare function parseAdapterChoice(input: string): 'dsh' | 'claude-code' | 'all' | null;
/** CLI 主入口；返回进程退出码 */
export declare function runCli(argv: string[]): Promise<number>;
