/** zstd CLI 与 fzstd 均不可用 */
export declare class ZstdUnavailableError extends Error {
    constructor();
    /** 根据当前平台生成对应的安装指引 */
    installHint(): string;
}
/** 解压结果 */
export interface DecompressResult {
    /** 是否成功 */
    ok: boolean;
    /** 实际使用的解压方式 */
    method: 'cli' | 'fzstd';
    /** 失败原因（ok=false 时） */
    error?: string;
}
/**
 * 流式解压 zstd 压缩的 JSONL 文件，逐行回调 onLine。
 *
 * 回退策略：
 * - CLI 不存在（ENOENT）→ fzstd
 * - CLI 退出非 0 且已输出部分行 → 判定文件损坏（如截断），直接失败，
 *   不再回退以免同文件行被重复输出
 * - CLI 退出非 0 且未输出任何行 → 尝试 fzstd（少数 CLI 环境问题场景）
 */
export declare function streamZstdLines(filePath: string, onLine: (line: string) => void, onWarn?: (msg: string) => void): Promise<DecompressResult>;
/**
 * 只解压读取首行（会话头窥探用）。
 * CLI 路径读到首行即杀掉 zstd 进程，避免解压整个文件。
 * 返回 null 表示无法读取（文件损坏 / 空文件 / 解压工具缺失）。
 */
export declare function readFirstZstdLine(filePath: string): Promise<string | null>;
