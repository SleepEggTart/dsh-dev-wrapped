/**
 * 报告共享格式化工具（compact 单页与 story 叙事页复用）
 *
 * 数字本地化：zh 用 万/亿 缩写，en 用 K/M 缩写；
 * HTML 转义对工具名、路径等不可信文本强制执行。
 */
import type { Lang } from '../i18n.js';
/** HTML 转义（数据中的工具名、路径等不可信文本） */
export declare function esc(s: string): string;
/** 千分位分隔（zh-CN 与 en-US 的分组习惯一致） */
export declare function fmt(n: number): string;
/** 时长人性化：天/时/分（按语言输出单位） */
export declare function fmtDuration(ms: number, lang: Lang): string;
/** token 数值友好化（zh：万/亿；en：K/M） */
export declare function fmtTokens(n: number, lang: Lang): string;
/** 时间戳 → 'YYYY-MM-DD HH:mm' */
export declare function fmtDateTime(time: number): string;
