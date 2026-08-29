import type { NormalizedEvent, RawSessionFile, SessionAdapter } from '../types.js';
export { TOOL_CATEGORIES, OTHER_CATEGORY, toolCategory } from '../tools.js';
/** 会话头窥探结果（首行解析） */
export interface DshSessionHeader {
    id: string;
    createdAt: number;
    cwd: string;
    origin: 'main' | 'subagent';
    agentPreset?: string;
}
/** DSH 会话适配器实现 */
export declare class DshAdapter implements SessionAdapter {
    readonly id = "dsh";
    /**
     * 扫描数据根目录（$DSH_HOME），收集全部含 session.jsonl.zstd 的会话目录。
     * 主会话与子代理会话都收集；统计阶段再按口径决定是否并入。
     */
    scan(rootDir: string): Promise<RawSessionFile[]>;
    /**
     * 窥探会话头（只解压首行），用于 CLI 在全量解析前统计主/子代理数与工作目录数。
     * 无法读取（损坏 / 空文件 / 解压工具缺失）返回 null。
     */
    peekSessionHeader(file: RawSessionFile): Promise<DshSessionHeader | null>;
    /**
     * 解析单个会话文件，映射为 NormalizedEvent 逐个发出。
     * 解压失败（zstd 损坏等）时抛错，由上层警告并跳过该会话，不中断全局。
     */
    parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void>;
}
/**
 * 将单行 DSH 原始记录映射为统一事件。
 * sessionId 通过 getter 读取（session 头可能在本行才更新真实 id）。
 * 导出供单测直接验证映射逻辑。
 */
export declare function mapDshLine(rec: Record<string, unknown>, getSessionId: () => string, setSessionId: (id: string) => void, onEvent: (e: NormalizedEvent) => void): void;
