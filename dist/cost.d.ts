/**
 * 成本估算（阶段四 --estimate-cost）
 *
 * 口径红线：token 本身禁止估算（只采用真实 usage，缺失即 null）；
 * 成本估算是在真实 token 之上按公开单价计算的派生值，且为显式 opt-in，
 * 卡片上必须标注"估算"。
 *
 * 单价来源：DeepSeek 官网 deepseek-chat 标准价（人民币/百万 tokens），
 * 随官网调价更新此常量即可，不影响历史报告（估算不落库持久化）。
 */
import type { CostEstimate } from './types.js';
/** DeepSeek deepseek-chat 单价（人民币 / 百万 tokens） */
export declare const DEEPSEEK_PRICING: {
    model: string;
    currency: "CNY";
    /** 输入单价（缓存未命中口径；归一化 input 已并入 cache 项，无法拆分计价） */
    input: number;
    /** 输出单价 */
    output: number;
};
/**
 * 按真实 token 用量估算成本。
 * tokens 为 null 时由调用方跳过（不估算 token，自然无从估算成本）。
 */
export declare function estimateCost(tokens: {
    input: number;
    output: number;
}): CostEstimate;
/** 成本金额展示：¥x.xx（大于 1000 时保留 1 位小数） */
export declare function fmtCost(amount: number): string;
