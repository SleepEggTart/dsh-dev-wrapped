/**
 * 开发者人格画像（v1.2.0）
 *
 * 作息 × 风格两维正交组合，共 6 种人格，纯本地规则计算。
 * 维度定义见 docs/PRD.md 第 5.2 节：
 * - 作息：按 timeline.peakHour 落段（night 20-5 / day 6-12 / evening 12-19）
 * - 风格：轮均工具调用（totalToolCalls / totalTurns）>= 8 为 heavy
 */
import type { DevWrappedReport, Personality } from './types.js';
/** 计算开发者人格；工具调用总数为 0 时返回 null（样本不足不贴标签） */
export declare function computePersonality(report: DevWrappedReport): Personality | null;
/** 人格 id → 图标（渲染层展示用） */
export declare const PERSONALITY_ICONS: Record<string, string>;
/** 人格 id → i18n 名称键（personalityNightArchitect 等） */
export declare function personalityNameKey(id: string): string;
/** 人格 id → i18n 描述键（personalityNightArchitectDesc 等） */
export declare function personalityDescKey(id: string): string;
