/**
 * AI 年度总结 prompt 生成（v1.3.0）
 *
 * 设计决策：不调用任何模型 API —— 基于报告数据生成一段结构化 prompt，
 * 用户复制粘贴回自己的 DSH / Claude Code 会话即可生成本地个性化总结。
 * 零依赖、零成本、不破坏"100% 本地"产品定位。
 */
import type { DevWrappedReport } from './types.js';
import type { Lang } from './i18n.js';
/** 生成结构化 prompt 文本（含报告关键统计，用户贴回自己的 AI CLI 生成总结） */
export declare function buildSummaryPrompt(report: DevWrappedReport, lang?: Lang): string;
