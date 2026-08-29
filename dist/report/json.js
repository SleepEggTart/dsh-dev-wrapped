/**
 * JSON 报告输出
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
/** 报告文件名前缀 */
const FILE_PREFIX = 'dsh-dev-wrapped';
/** 本地时区 'YYYY-MM-DD' */
export function localDateKey(time) {
    const d = new Date(time);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}
/** 序列化为 JSON 字符串（2 空格缩进，保证可读性） */
export function toJsonReport(report) {
    return JSON.stringify(report, null, 2);
}
/** 计算报告文件路径（不含扩展名）：dsh-dev-wrapped-YYYY-MM-DD */
export function reportBaseName(report) {
    return `${FILE_PREFIX}-${localDateKey(report.generatedAt)}`;
}
/** 写入 JSON 报告文件，返回文件绝对路径 */
export async function writeJsonReport(report, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${reportBaseName(report)}.json`);
    await fs.writeFile(filePath, toJsonReport(report), 'utf8');
    return filePath;
}
