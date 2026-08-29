/**
 * 跨适配器共享的工具分类映射
 *
 * 键统一为小写：DSH 工具名为小写（read/grep/...），
 * Claude Code 工具名为 PascalCase（Read/Grep/...），
 * 匹配时先 toLowerCase 再查表，显示名保留原始大小写。
 */
/** 工具分类映射（DSH v2 提示词 3.5 节 + 实测补充 + Claude Code 工具） */
export const TOOL_CATEGORIES = {
    // 📖 文件操作
    read: '📖 文件操作',
    // ✏️ 代码产出
    write: '✏️ 代码产出',
    edit: '✏️ 代码产出',
    multiedit: '✏️ 代码产出',
    notebookedit: '✏️ 代码产出',
    str_replace_editor: '✏️ 代码产出',
    // 🔍 搜索
    glob: '🔍 文件搜索',
    grep: '🔍 内容搜索',
    // 🖥️ 命令执行
    bash: '🖥️ 命令执行',
    pwsh: '🖥️ 命令执行',
    powershell: '🖥️ 命令执行',
    pwd: '🖥️ 命令执行',
    job_list: '🖥️ 命令执行',
    job_output: '🖥️ 命令执行',
    job_kill: '🖥️ 命令执行',
    // 🤖 代理委派
    subagent: '🤖 代理委派',
    agent: '🤖 代理委派',
    task: '🤖 代理委派',
    // 🌐 信息检索 / 浏览器
    web_search: '🌐 信息检索',
    websearch: '🌐 信息检索',
    web_fetch: '🌐 信息检索',
    webfetch: '🌐 信息检索',
    read_page: '🌐 信息检索',
    browser_navigate: '🌐 浏览器',
    browser_click: '🌐 浏览器',
    browser_snapshot: '🌐 浏览器',
    // 💬 人机交互
    ask_user_question: '💬 人机交互',
    askuserquestion: '💬 人机交互',
    exitplanmode: '💬 人机交互',
    // 📋 任务管理
    todo_write: '📋 任务管理',
    todowrite: '📋 任务管理',
    todoread: '📋 任务管理',
    taskcreate: '📋 任务管理',
    taskupdate: '📋 任务管理',
    tasklist: '📋 任务管理',
    taskstop: '📋 任务管理',
    taskoutput: '📋 任务管理',
    // 🧠 技能加载
    skill: '🧠 技能加载',
    slashcommand: '🧠 技能加载',
    // 🖼️ 多媒体
    read_image: '🖼️ 多媒体',
    describe_image: '🖼️ 多媒体',
};
/** 未知工具的归类 */
export const OTHER_CATEGORY = '📦 其他';
/** 获取工具分类（大小写不敏感） */
export function toolCategory(name) {
    return TOOL_CATEGORIES[name.toLowerCase()] ?? OTHER_CATEGORY;
}
