/** DeepSeek deepseek-chat 单价（人民币 / 百万 tokens） */
export const DEEPSEEK_PRICING = {
    model: 'deepseek-chat',
    currency: 'CNY',
    /** 输入单价（缓存未命中口径；归一化 input 已并入 cache 项，无法拆分计价） */
    input: 2,
    /** 输出单价 */
    output: 8,
};
/**
 * 按真实 token 用量估算成本。
 * tokens 为 null 时由调用方跳过（不估算 token，自然无从估算成本）。
 */
export function estimateCost(tokens) {
    const { input, output, currency, model } = DEEPSEEK_PRICING;
    const inputCost = (tokens.input / 1_000_000) * input;
    const outputCost = (tokens.output / 1_000_000) * output;
    return {
        model,
        currency,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        inputCost,
        outputCost,
        total: inputCost + outputCost,
    };
}
/** 成本金额展示：¥x.xx（大于 1000 时保留 1 位小数） */
export function fmtCost(amount) {
    const s = amount >= 1000 ? amount.toFixed(1) : amount.toFixed(2);
    return `¥${s}`;
}
