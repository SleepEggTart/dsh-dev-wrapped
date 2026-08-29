/**
 * JSONL 逐行安全解析
 *
 * 单行解析失败只跳过该行（可选发出警告），不中断整体；
 * tool/call 的 data.arguments 是 JSON 字符串，需二次 parse，失败记为 {}。
 */
/** 解析单行 JSON；空行或解析失败返回 undefined */
export declare function parseJsonlLine(line: string, onWarn?: (msg: string) => void): unknown;
/**
 * 二次解析 tool/call 的 data.arguments。
 * 真实数据中 arguments 是 JSON 字符串；解析失败或结果非对象时返回 {}。
 */
export declare function parseToolArguments(raw: unknown): Record<string, unknown>;
