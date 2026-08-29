import type { DevWrappedReport } from '../types.js';
/** 本地时区 'YYYY-MM-DD' */
export declare function localDateKey(time: number): string;
/** 序列化为 JSON 字符串（2 空格缩进，保证可读性） */
export declare function toJsonReport(report: DevWrappedReport): string;
/** 计算报告文件路径（不含扩展名）：dsh-dev-wrapped-YYYY-MM-DD */
export declare function reportBaseName(report: DevWrappedReport): string;
/** 写入 JSON 报告文件，返回文件绝对路径 */
export declare function writeJsonReport(report: DevWrappedReport, outputDir: string): Promise<string>;
