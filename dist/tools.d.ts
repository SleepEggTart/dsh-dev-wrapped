/**
 * 跨适配器共享的工具分类映射
 *
 * 键统一为小写：DSH 工具名为小写（read/grep/...），
 * Claude Code 工具名为 PascalCase（Read/Grep/...），
 * 匹配时先 toLowerCase 再查表，显示名保留原始大小写。
 */
/** 工具分类映射（DSH v2 提示词 3.5 节 + 实测补充 + Claude Code 工具） */
export declare const TOOL_CATEGORIES: Record<string, string>;
/** 未知工具的归类 */
export declare const OTHER_CATEGORY = "\uD83D\uDCE6 \u5176\u4ED6";
/** 获取工具分类（大小写不敏感） */
export declare function toolCategory(name: string): string;
