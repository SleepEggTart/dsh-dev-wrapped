/** 风格阈值：轮均工具调用达到该值即为重型 */
const HEAVY_TOOL_CALLS_PER_TURN = 8;
/** 峰值小时 → 作息维度 */
function rhythmOf(peakHour) {
    // 无峰值数据按日间处理
    if (peakHour === null)
        return 'day';
    // 20:00-23:59 与 0:00-5:59 为夜猫子
    if (peakHour >= 20 || peakHour <= 5)
        return 'night';
    // 6:00-12:59 为日间（含 12 点整）
    if (peakHour >= 6 && peakHour <= 12)
        return 'day';
    // 13:00-19:59 为傍晚
    return 'evening';
}
/** 作息 × 风格 → 人格 id（i18n 文案 key） */
const PERSONALITY_IDS = {
    night: { heavy: 'night-architect', light: 'moonlight-conversationalist' },
    day: { heavy: 'dawn-commander', light: 'morning-tea-talker' },
    evening: { heavy: 'afternoon-sprinter', light: 'steady-craftsman' },
};
/** 计算开发者人格；工具调用总数为 0 时返回 null（样本不足不贴标签） */
export function computePersonality(report) {
    const { overview, timeline } = report;
    if (overview.totalToolCalls <= 0)
        return null;
    const rhythm = rhythmOf(timeline.peakHour);
    // 轮数为 0（异常数据）按轻型处理，避免除零
    const perTurn = overview.totalTurns > 0 ? overview.totalToolCalls / overview.totalTurns : 0;
    const style = perTurn >= HEAVY_TOOL_CALLS_PER_TURN ? 'heavy' : 'light';
    return { id: PERSONALITY_IDS[rhythm][style], rhythm, style };
}
/** 人格 id → 图标（渲染层展示用） */
export const PERSONALITY_ICONS = {
    'night-architect': '🌃',
    'moonlight-conversationalist': '🌙',
    'dawn-commander': '🌅',
    'morning-tea-talker': '☕',
    'afternoon-sprinter': '⚡',
    'steady-craftsman': '🌤️',
};
/** 人格 id → i18n 名称键（personalityNightArchitect 等） */
export function personalityNameKey(id) {
    return 'personality' + id
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
}
/** 人格 id → i18n 描述键（personalityNightArchitectDesc 等） */
export function personalityDescKey(id) {
    return personalityNameKey(id) + 'Desc';
}
