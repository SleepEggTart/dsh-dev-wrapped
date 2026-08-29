import type { DevWrappedReport } from '../types.js';
import type { Lang } from '../i18n.js';
/** 生成完整 HTML 报告（compact 紧凑单页模式） */
export declare function toHtmlReport(report: DevWrappedReport, lang?: Lang): string;
/** 写入 HTML 报告文件，返回文件绝对路径 */
export declare function writeHtmlReport(report: DevWrappedReport, outputDir: string, lang?: Lang, 
/** 文件名后缀（如 '-compact'；story 模式附带的总结页用，避免覆盖主报告） */
fileSuffix?: string): Promise<string>;
