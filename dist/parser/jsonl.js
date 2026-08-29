/**
 * JSONL 逐行安全解析
 *
 * 单行解析失败只跳过该行（可选发出警告），不中断整体；
 * tool/call 的 data.arguments 是 JSON 字符串，需二次 parse，失败记为 {}。
 */
/** 解析单行 JSON；空行或解析失败返回 undefined */
export function parseJsonlLine(line, onWarn) {
    const trimmed = line.trim();
    if (!trimmed)
        return undefined;
    try {
        return JSON.parse(trimmed);
    }
    catch (err) {
        onWarn?.(`JSON 行解析失败已跳过: ${err.message}`);
        return undefined;
    }
}
/**
 * 二次解析 tool/call 的 data.arguments。
 * 真实数据中 arguments 是 JSON 字符串；解析失败或结果非对象时返回 {}。
 */
export function parseToolArguments(raw) {
    // 兼容防御：若上游格式演进为对象，直接采用
    if (typeof raw !== 'string') {
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw;
        }
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        return {};
    }
}
