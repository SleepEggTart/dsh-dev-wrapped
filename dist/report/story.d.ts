import type { DevWrappedReport } from '../types.js';
import type { Lang } from '../i18n.js';
/** 报告标题（品牌名或年度回顾，compact 与 story 共用口径） */
export declare function reportTitle(report: DevWrappedReport, lang: Lang): string;
/** 生成完整 story HTML */
export declare function toStoryReport(report: DevWrappedReport, lang?: Lang): string;
/** 写入 story 报告文件，返回文件绝对路径 */
export declare function writeStoryReport(report: DevWrappedReport, outputDir: string, lang?: Lang): Promise<string>;
