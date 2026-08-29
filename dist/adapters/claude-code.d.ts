import type { NormalizedEvent, RawSessionFile, SessionAdapter, SessionHeader } from '../types.js';
/** Claude Code 会话适配器实现 */
export declare class ClaudeCodeAdapter implements SessionAdapter {
    readonly id = "claude-code";
    /**
     * 扫描数据根目录（$CLAUDE_HOME）：
     * - projects/<proj>/*.jsonl → 主会话（sessionId = 文件名主干）
     * - projects/<proj>/<sid>/subagents/agent-*.jsonl → 子代理会话（派生 id）
     * memory/、tool-results/、sessions-index.json 等非会话内容忽略。
     */
    scan(rootDir: string): Promise<RawSessionFile[]>;
    /**
     * 窥探会话头（流式读前若干行，取首个 timestamp 与 cwd）。
     * 无法读取（空文件 / 无带时间戳的行）返回 null。
     */
    peekSessionHeader(file: RawSessionFile): Promise<SessionHeader | null>;
    /**
     * 解析单个会话文件，映射为 NormalizedEvent 逐个发出。
     * 读文件失败（文件被删除等）抛错，由上层警告并跳过该会话。
     *
     * 实现说明：事件先缓冲、文件读完后统一发出——
     * 因为同一 message.id 跨多行携带的 usage 需以最后一次为准（流式补全），
     * 缓冲期间可直接原地更新已建事件对象的 usage 字段。
     */
    parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void>;
}
