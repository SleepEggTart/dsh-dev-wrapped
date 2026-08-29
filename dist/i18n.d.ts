/**
 * 报告文案多语言表（阶段四 i18n）
 *
 * 默认中文；--lang en 输出英文卡片（面向海外社区分享）。
 * 品牌名（DSH / Claude Code / Dev Wrapped）与统计数字本身不翻译。
 * 占位符格式 {name}，由 t() 替换。
 */
/** 支持的语言 */
export type Lang = 'zh' | 'en';
/** 中文文案表（键的唯一权威定义处，英文表必须与之对齐） */
declare const zh: {
    yearTitle: string;
    rangeDays: string;
    statSessions: string;
    statTurns: string;
    statToolCalls: string;
    statActiveDays: string;
    toolRankTitle: string;
    toolRankSub: string;
    noToolData: string;
    hourlyTitle: string;
    peakLabel: string;
    noData: string;
    highlightsTitle: string;
    favoriteTool: string;
    favoriteWorkspace: string;
    longestSession: string;
    mostComplexTask: string;
    moreDataTitle: string;
    userMessages: string;
    tokenUsage: string;
    tokensIn: string;
    tokensOut: string;
    tokensMissing: string;
    costEstimate: string;
    costEstimateNote: string;
    filesRead: string;
    filesWritten: string;
    peakDay: string;
    topExts: string;
    toolStabilityTitle: string;
    toolStabilitySub: string;
    thTool: string;
    thErrors: string;
    thErrorRate: string;
    noErrorData: string;
    lateNightRatio: string;
    lateNightNote: string;
    weekdayVsWeekend: string;
    weekdayVsWeekendNote: string;
    modelDist: string;
    agentPresetDist: string;
    topSessionsTitle: string;
    thProject: string;
    thStart: string;
    thTurns: string;
    thToolCalls: string;
    thTopTools: string;
    unitCalls: string;
    unitToolCalls: string;
    unitTurns: string;
    unitSteps: string;
    unitToolsKinds: string;
    unitDay: string;
    unitHour: string;
    unitMinute: string;
    footerGeneratedBy: string;
    footerDataFrom: string;
    dataSourceDsh: string;
    dataSourceClaude: string;
    dataSourceAll: string;
    storyScrollHint: string;
    storySessionsLead: string;
    storySessionsTail: string;
    storyToolCallsLead: string;
    storyToolCallsTail: string;
    storyFavToolLead: string;
    storyFavToolTimes: string;
    storyPeakLead: string;
    storyPeakTail: string;
    storyLongestLead: string;
    storyLongestSub: string;
    storyWorkspaceLead: string;
    storyWorkspaceCalls: string;
    storyTokenLead: string;
    storyTokenSub: string;
    storyModelLead: string;
    storyModelSub: string;
    storyLateNightLead: string;
    storyLateNightSub: string;
    storyUnstableToolLead: string;
    storyUnstableToolSub: string;
    storyFinalLead: string;
    storyFinalSub: string;
    viewSummary: string;
    badgesTitle: string;
    badgesSub: string;
    noBadgeEarned: string;
    badgeLateNight: string;
    badgeLateNightDesc: string;
    badgeNightOwl: string;
    badgeNightOwlDesc: string;
    badgeEarlyBird: string;
    badgeEarlyBirdDesc: string;
    badgeToolCollector: string;
    badgeToolCollectorDesc: string;
    badgeMultiCategory: string;
    badgeMultiCategoryDesc: string;
    badgeWeekendWarrior: string;
    badgeWeekendWarriorDesc: string;
    badgePersistent: string;
    badgePersistentDesc: string;
    badgeChatterbox: string;
    badgeChatterboxDesc: string;
    badgeProductive: string;
    badgeProductiveDesc: string;
    badgeMarathon: string;
    badgeMarathonDesc: string;
    badgeRockSolid: string;
    badgeRockSolidDesc: string;
    badge996Warning: string;
    badge996WarningDesc: string;
    badge4amClub: string;
    badge4amClubDesc: string;
    storyMonthCalls: string;
    storyMonthSessions: string;
    compareTitle: string;
    compareSub: string;
    compareSessions: string;
    compareTurns: string;
    compareToolCalls: string;
    compareActiveDays: string;
    compareTokens: string;
    compareNewStart: string;
    personalityTitle: string;
    personalityNightArchitect: string;
    personalityNightArchitectDesc: string;
    personalityMoonlightConversationalist: string;
    personalityMoonlightConversationalistDesc: string;
    personalityDawnCommander: string;
    personalityDawnCommanderDesc: string;
    personalityMorningTeaTalker: string;
    personalityMorningTeaTalkerDesc: string;
    personalityAfternoonSprinter: string;
    personalityAfternoonSprinterDesc: string;
    personalitySteadyCraftsman: string;
    personalitySteadyCraftsmanDesc: string;
    sourceDistTitle: string;
    sourceDistSub: string;
    sourceDsh: string;
    sourceClaudeCode: string;
    empty: string;
};
/** 文案表：语言 → 键 → 文案 */
export declare const STRINGS: Record<Lang, Record<string, string>>;
/** 中文文案表的键类型（渲染层动态构造 key 时用于类型收敛） */
export type StringsKey = keyof typeof zh;
/** 年度对比指标 key（sessions/turns/...）→ 文案键（compareSessions/...） */
export declare function compareMetricKey(key: string): StringsKey;
/**
 * 取文案并替换 {name} 占位符。
 * 未知键返回键名本身（开发期显式暴露问题，不静默空串）。
 */
export declare function t(lang: Lang, key: keyof typeof zh, params?: Record<string, string | number>): string;
export {};
