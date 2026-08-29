/** 生成结构化 prompt 文本（含报告关键统计，用户贴回自己的 AI CLI 生成总结） */
export function buildSummaryPrompt(report, lang = 'zh') {
    const o = report.overview;
    const top3 = report.toolUsage.slice(0, 3).map((tool) => `${tool.name}(${tool.count})`);
    const badges = report.badges.filter((b) => b.earned).map((b) => b.id);
    const peak = report.timeline.peakHour;
    if (lang === 'en') {
        return `You are a personal developer-year-recap writer (Spotify Wrapped style).
Based on the following real statistics, write a warm, playful 5-8 sentence narrative
summary of my year coding with AI. Mention concrete numbers, celebrate quirks,
and end with a one-line outlook. No markdown tables.

My stats:
- Main sessions: ${o.totalSessions}, turns: ${o.totalTurns}, tool calls: ${o.totalToolCalls}
- Active days: ${o.activeDays}
- Peak hour: ${peak !== null ? peak + ':00' : 'n/a'}
- Top tools: ${top3.join(', ') || 'n/a'}
${report.personality ? `- Personality: ${report.personality.id}` : ''}
${badges.length > 0 ? `- Badges earned: ${badges.join(', ')}` : ''}
${o.tokens ? `- Tokens: ${o.tokens.input} in / ${o.tokens.output} out` : ''}`;
    }
    return `你是一位开发者年度回顾文案作者（Spotify Wrapped 风格）。
请基于下面这些真实统计数据，为我写一段 5-8 句的中文年度总结：
风格要温暖、俏皮，多用具体数字，庆祝那些古怪的习惯（比如深夜编码），
结尾用一句话展望明年。不要使用 Markdown 表格。

我的数据：
- 主会话数：${o.totalSessions}，对话轮数：${o.totalTurns}，工具调用：${o.totalToolCalls}
- 活跃天数：${o.activeDays} 天
- 高峰时段：${peak !== null ? peak + ' 点' : '无'}
- 最常用工具：${top3.join('、') || '无'}
${report.personality ? `- 开发者人格：${report.personality.id}` : ''}
${badges.length > 0 ? `- 已解锁徽章：${badges.join('、')}` : ''}
${o.tokens ? `- Token 用量：输入 ${o.tokens.input} / 输出 ${o.tokens.output}` : ''}`;
}
