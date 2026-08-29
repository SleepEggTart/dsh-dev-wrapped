/**
 * 统计聚合层
 *
 * 只消费 NormalizedEvent（不感知数据来自哪个 CLI），
 * 按 v2 提示词第四节统计口径聚合为 DevWrappedReport。
 *
 * 口径要点：
 * - 子代理会话默认排除；includeSubagents 打开时其 tool-call/tool-result
 *   并入总工具统计，但不计入会话总数、不参与 topSessions
 * - token 只累加 assistant-message 携带的真实 usage；存在缺失即整体置 null（禁止估算）
 * - 用户消息数过滤 isInjected（<system-reminder> 注入）
 * - --since/--until 过滤基准是 session 的 createdAt
 * - 最长会话 durationMs：会话内最后事件时间 - createdAt
 */
import type { DevWrappedReport, NormalizedEvent } from '../types.js';
/** 统计选项 */
export interface StatsOptions {
    /** 并入子代理会话的工具调用统计（默认 false） */
    includeSubagents?: boolean;
    /** 起始日期（含），epoch ms，本地时区当日 00:00:00 */
    since?: number;
    /** 结束日期（含），epoch ms，本地时区当日 23:59:59.999 */
    until?: number;
}
/** 从事件流聚合报告 */
export declare function aggregate(events: NormalizedEvent[], opts?: StatsOptions): DevWrappedReport;
