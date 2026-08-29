/**
 * 成就徽章系统（v1.1.0）
 *
 * 基于 DevWrappedReport 现有数据纯函数计算，不新增解析逻辑。
 * 阈值定义见 docs/PRD.md 第 4.1 节；文案 key 见 src/i18n.ts。
 */
import type { Badge, DevWrappedReport } from './types.js';
import type { StringsKey } from './i18n.js';
/** 徽章 id → 图标（渲染层展示用；未命中兜底 🏅） */
export declare const BADGE_ICONS: Record<string, string>;
/** 徽章 id（kebab-case）→ i18n 名称键（badgeLateNight 等） */
export declare function badgeNameKey(id: string): StringsKey;
/** 徽章 id（kebab-case）→ i18n 描述键（badgeLateNightDesc 等） */
export declare function badgeDescKey(id: string): StringsKey;
/** 按徽章 id 与数值计算等级（未达铜级即未达成时返回 null） */
export declare function computeBadgeLevel(id: string, value: number, earned: boolean): 'bronze' | 'silver' | 'gold' | null;
/** 计算全部徽章（含未达成项，渲染层可自行过滤） */
export declare function computeBadges(report: DevWrappedReport): Badge[];
