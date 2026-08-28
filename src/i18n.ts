/**
 * 报告文案多语言表（阶段四 i18n）
 *
 * 默认中文；--lang en 输出英文卡片（面向海外社区分享）。
 * 品牌名（DSH / Claude Code / Dev Wrapped）与统计数字本身不翻译。
 * 占位符格式 {name}，由 t() 替换。
 */

/** 支持的语言 */
export type Lang = 'zh' | 'en'

/** 中文文案表（键的唯一权威定义处，英文表必须与之对齐） */
const zh = {
  /* ---------- 标题与时间范围 ---------- */
  yearTitle: '{year} 年度回顾',
  rangeDays: '{n} 天',
  /* ---------- 核心数字 ---------- */
  statSessions: '会话总数',
  statTurns: '对话轮数',
  statToolCalls: '工具调用',
  statActiveDays: '活跃天数',
  /* ---------- 工具排行 ---------- */
  toolRankTitle: '🛠️ 工具排行',
  toolRankSub: 'TOP8（含 {n} 次调用）',
  noToolData: '暂无工具调用数据',
  /* ---------- 小时分布 ---------- */
  hourlyTitle: '24 小时活跃分布',
  peakLabel: '高峰时段 {hh}:00',
  noData: '无数据',
  /* ---------- 亮点 ---------- */
  highlightsTitle: '✨ 你的开发亮点',
  favoriteTool: '最爱工具',
  favoriteWorkspace: '最爱项目',
  longestSession: '最长会话',
  mostComplexTask: '最复杂任务',
  /* ---------- 更多数据 ---------- */
  moreDataTitle: '📊 更多数据',
  userMessages: '用户消息',
  tokenUsage: 'Token 用量',
  tokensIn: '输入',
  tokensOut: '输出',
  tokensMissing: '部分会话缺少用量记录',
  costEstimate: '成本估算',
  costEstimateNote: '估算值 · 按 {model} 单价（输入 ¥{in}/M、输出 ¥{out}/M）',
  filesRead: '读取文件（去重）',
  filesWritten: '写入文件（去重）',
  peakDay: '最活跃的一天',
  topExts: '常打交道扩展名',
  /* ---------- 阶段五：统计深化 ---------- */
  toolStabilityTitle: '🩺 工具稳定性',
  toolStabilitySub: '错误次数 TOP{max}（错误率 = 错误 / 总调用）',
  thTool: '工具',
  thErrors: '错误',
  thErrorRate: '错误率',
  noErrorData: '期间没有工具报错，稳定性满分 🎉',
  lateNightRatio: '深夜编码占比',
  lateNightNote: '0-6 点调用 {pct}',
  weekdayVsWeekend: '工作日 / 周末',
  weekdayVsWeekendNote: '{wd} / {we} 次调用',
  modelDist: '模型分布',
  agentPresetDist: 'DSH 预设',
  /* ---------- 热门会话 ---------- */
  topSessionsTitle: '🏆 热门会话 TOP5',
  thProject: '项目',
  thStart: '开始时间',
  thTurns: '轮次',
  thToolCalls: '工具调用',
  thTopTools: '常用工具',
  /* ---------- 单位 ---------- */
  unitCalls: '次调用',
  unitToolCalls: '次工具调用',
  unitTurns: '轮',
  unitSteps: '步',
  unitToolsKinds: '种工具',
  unitDay: '天',
  unitHour: '小时',
  unitMinute: '分钟',
  /* ---------- 页脚 ---------- */
  footerGeneratedBy: '由 dsh-dev-wrapped 生成',
  footerDataFrom: '数据 100% 来自本地{source}会话记录',
  dataSourceDsh: 'DSH',
  dataSourceClaude: 'Claude Code',
  dataSourceAll: 'DSH + Claude Code',
  /* ---------- story 叙事屏 ---------- */
  storyScrollHint: '向下滚动开启回顾 ↓',
  storySessionsLead: '这段时间你开启了',
  storySessionsTail: '个 AI 结对编程会话',
  storyToolCallsLead: '一共发起了',
  storyToolCallsTail: '次工具调用',
  storyFavToolLead: '你的最爱工具是',
  storyFavToolTimes: '共 {n} 次',
  storyPeakLead: '你的代码高峰出现在',
  storyPeakTail: '点',
  storyLongestLead: '最长的一次会话持续了',
  storyLongestSub: '{tools} 次工具调用 · {turns} 轮 · {workspace}',
  storyWorkspaceLead: '你最常奋战的项目是',
  storyWorkspaceCalls: '{n} 次工具调用',
  storyTokenLead: '模型为你处理了',
  storyTokenSub: '{in} 输入 · {out} 输出',
  storyModelLead: '陪你最多的是',
  storyModelSub: '共 {n} 条回复',
  storyLateNightLead: '你有',
  storyLateNightSub: '的工具调用发生在 0-6 点深夜',
  storyUnstableToolLead: '最让你抓狂的工具是',
  storyUnstableToolSub: '{errors} 次失败 / 共 {calls} 次调用（错误率 {rate}%）',
  storyFinalLead: '你在 {n} 个日子里与 AI 并肩作战',
  storyFinalSub: '期待下一段旅程 ✨',
  /* ---------- v1.1.0：成就徽章 ---------- */
  badgesTitle: '🏅 成就徽章',
  badgesSub: '解锁 {n} / {total} 枚',
  noBadgeEarned: '继续使用，徽章等着你解锁',
  badgeLateNight: '深夜代码手',
  badgeLateNightDesc: '深夜（0-6 点）调用占比 {pct}',
  badgeNightOwl: '夜猫子',
  badgeNightOwlDesc: '活跃高峰在 {hh}:00',
  badgeEarlyBird: '晨间开发者',
  badgeEarlyBirdDesc: '活跃高峰在 {hh}:00',
  badgeToolCollector: '工具收藏家',
  badgeToolCollectorDesc: '用过 {n} 种工具',
  badgeMultiCategory: '多面手',
  badgeMultiCategoryDesc: '覆盖 {n} 类工具',
  badgeWeekendWarrior: '周末战士',
  badgeWeekendWarriorDesc: '周末调用占比 {pct}',
  badgePersistent: '持之以恒',
  badgePersistentDesc: '活跃 {n} 天',
  badgeChatterbox: '话痨',
  badgeChatterboxDesc: '{n} 轮对话',
  badgeProductive: '高产选手',
  badgeProductiveDesc: '{n} 次工具调用',
  badgeMarathon: '马拉松选手',
  badgeMarathonDesc: '最长会话 {dur}',
  badgeRockSolid: '稳如磐石',
  badgeRockSolidDesc: '整体错误率仅 {pct}',
  /* ---------- v1.1.0：年度对比 ---------- */
  compareTitle: '📈 年度成长',
  compareSub: '{cur} vs {prev}',
  compareSessions: '会话',
  compareTurns: '轮次',
  compareToolCalls: '工具调用',
  compareActiveDays: '活跃天数',
  compareTokens: 'Token',
  compareNewStart: '全新起步',
  /* ---------- v1.2.0：开发者人格 ---------- */
  personalityTitle: '你的开发者人格',
  personalityNightArchitect: '午夜建筑师',
  personalityNightArchitectDesc: '夜色是你的专注时段，重型工具链是你的画笔',
  personalityMoonlightConversationalist: '月下对话者',
  personalityMoonlightConversationalistDesc: '深夜与 AI 深谈，用对话而非堆砌工具解决问题',
  personalityDawnCommander: '晨光指挥官',
  personalityDawnCommanderDesc: '清晨进入状态，指挥工具大军高效推进',
  personalityMorningTeaTalker: '上午茶谈客',
  personalityMorningTeaTalkerDesc: '上午的节奏属于从容的对话与思考',
  personalityAfternoonSprinter: '高效推进器',
  personalityAfternoonSprinterDesc: '午后火力全开，工具调用如疾风骤雨',
  personalitySteadyCraftsman: '稳健工匠',
  personalitySteadyCraftsmanDesc: '午后稳步打磨，以对话精雕细节',
  /* ---------- v1.2.0：数据源分布 ---------- */
  sourceDistTitle: '数据源分布',
  sourceDistSub: '{n} 个数据源',
  sourceDsh: 'DSH',
  sourceClaudeCode: 'Claude Code',
  /* ---------- 其他 ---------- */
  empty: '—',
}

/** 英文文案表（键集合与 zh 完全一致） */
const en: Record<keyof typeof zh, string> = {
  /* ---------- 标题与时间范围 ---------- */
  yearTitle: '{year} Year in Review',
  rangeDays: '{n} days',
  /* ---------- 核心数字 ---------- */
  statSessions: 'Sessions',
  statTurns: 'Turns',
  statToolCalls: 'Tool Calls',
  statActiveDays: 'Active Days',
  /* ---------- 工具排行 ---------- */
  toolRankTitle: '🛠️ Tool Ranking',
  toolRankSub: 'TOP8 ({n} calls)',
  noToolData: 'No tool call data',
  /* ---------- 小时分布 ---------- */
  hourlyTitle: 'Activity by Hour',
  peakLabel: 'Peak at {hh}:00',
  noData: 'No data',
  /* ---------- 亮点 ---------- */
  highlightsTitle: '✨ Your Highlights',
  favoriteTool: 'Favorite Tool',
  favoriteWorkspace: 'Favorite Project',
  longestSession: 'Longest Session',
  mostComplexTask: 'Most Complex Task',
  /* ---------- 更多数据 ---------- */
  moreDataTitle: '📊 More Stats',
  userMessages: 'User Messages',
  tokenUsage: 'Token Usage',
  tokensIn: 'in',
  tokensOut: 'out',
  tokensMissing: 'Some sessions lack usage data',
  costEstimate: 'Cost Estimate',
  costEstimateNote: 'Estimated · {model} pricing (¥{in}/M in, ¥{out}/M out)',
  filesRead: 'Files Read (unique)',
  filesWritten: 'Files Written (unique)',
  peakDay: 'Busiest Day',
  topExts: 'Top File Types',
  /* ---------- 阶段五：统计深化 ---------- */
  toolStabilityTitle: '🩺 Tool Stability',
  toolStabilitySub: 'Top {max} by errors (error rate = errors / calls)',
  thTool: 'Tool',
  thErrors: 'Errors',
  thErrorRate: 'Error Rate',
  noErrorData: 'No tool errors in this period 🎉',
  lateNightRatio: 'Late-Night Coding',
  lateNightNote: '{pct} of calls between 0-6 am',
  weekdayVsWeekend: 'Weekday / Weekend',
  weekdayVsWeekendNote: '{wd} / {we} calls',
  modelDist: 'Models',
  agentPresetDist: 'DSH Presets',
  /* ---------- 热门会话 ---------- */
  topSessionsTitle: '🏆 Top Sessions',
  thProject: 'Project',
  thStart: 'Started',
  thTurns: 'Turns',
  thToolCalls: 'Tool Calls',
  thTopTools: 'Top Tools',
  /* ---------- 单位 ---------- */
  unitCalls: 'calls',
  unitToolCalls: 'tool calls',
  unitTurns: 'turns',
  unitSteps: 'steps',
  unitToolsKinds: 'tools',
  unitDay: 'd',
  unitHour: 'h',
  unitMinute: 'm',
  /* ---------- 页脚 ---------- */
  footerGeneratedBy: 'Generated by dsh-dev-wrapped',
  footerDataFrom: 'Data 100% from local {source} session logs',
  dataSourceDsh: 'DSH',
  dataSourceClaude: 'Claude Code',
  dataSourceAll: 'DSH + Claude Code',
  /* ---------- story 叙事屏 ---------- */
  storyScrollHint: 'Scroll to start your review ↓',
  storySessionsLead: 'During this period you started',
  storySessionsTail: 'AI pair-programming sessions',
  storyToolCallsLead: 'You made a total of',
  storyToolCallsTail: 'tool calls',
  storyFavToolLead: 'Your favorite tool is',
  storyFavToolTimes: '{n} times',
  storyPeakLead: 'Your coding peak hits at',
  storyPeakTail:":00",
  storyLongestLead: 'Your longest session lasted',
  storyLongestSub: '{tools} tool calls · {turns} turns · {workspace}',
  storyWorkspaceLead: 'Your home project is',
  storyWorkspaceCalls: '{n} tool calls',
  storyTokenLead: 'The model processed for you',
  storyTokenSub: '{in} in · {out} out',
  storyModelLead: 'Your main companion was',
  storyModelSub: '{n} replies in total',
  storyLateNightLead: 'You had',
  storyLateNightSub: 'of tool calls between 0-6 AM',
  storyUnstableToolLead: 'The tool that drove you crazy was',
  storyUnstableToolSub: '{errors} failures / {calls} calls ({rate}% error rate)',
  storyFinalLead: 'You coded with AI on {n} days',
  storyFinalSub: 'See you next journey ✨',
  /* ---------- v1.1.0：成就徽章 ---------- */
  badgesTitle: '🏅 Achievements',
  badgesSub: '{n} / {total} unlocked',
  noBadgeEarned: 'Keep going — badges await unlocking',
  badgeLateNight: 'Late-Night Coder',
  badgeLateNightDesc: '{pct} of calls between 0-6 AM',
  badgeNightOwl: 'Night Owl',
  badgeNightOwlDesc: 'Peak activity at {hh}:00',
  badgeEarlyBird: 'Early Bird',
  badgeEarlyBirdDesc: 'Peak activity at {hh}:00',
  badgeToolCollector: 'Tool Collector',
  badgeToolCollectorDesc: 'Used {n} different tools',
  badgeMultiCategory: 'Jack of All Trades',
  badgeMultiCategoryDesc: 'Covered {n} tool categories',
  badgeWeekendWarrior: 'Weekend Warrior',
  badgeWeekendWarriorDesc: '{pct} of calls on weekends',
  badgePersistent: 'Persistent',
  badgePersistentDesc: 'Active on {n} days',
  badgeChatterbox: 'Chatterbox',
  badgeChatterboxDesc: '{n} turns of conversation',
  badgeProductive: 'Productive',
  badgeProductiveDesc: '{n} tool calls',
  badgeMarathon: 'Marathoner',
  badgeMarathonDesc: 'Longest session {dur}',
  badgeRockSolid: 'Rock Solid',
  badgeRockSolidDesc: 'Overall error rate only {pct}',
  /* ---------- v1.1.0：年度对比 ---------- */
  compareTitle: '📈 Year-over-Year',
  compareSub: '{cur} vs {prev}',
  compareSessions: 'Sessions',
  compareTurns: 'Turns',
  compareToolCalls: 'Tool Calls',
  compareActiveDays: 'Active Days',
  compareTokens: 'Tokens',
  compareNewStart: 'Brand New',
  /* ---------- v1.2.0：开发者人格 ---------- */
  personalityTitle: 'Your Developer Personality',
  personalityNightArchitect: 'Night Architect',
  personalityNightArchitectDesc: 'The night is your focus zone, heavy tooling is your brush',
  personalityMoonlightConversationalist: 'Moonlight Conversationalist',
  personalityMoonlightConversationalistDesc: 'Late-night deep talks with AI — dialogue over tool spam',
  personalityDawnCommander: 'Dawn Commander',
  personalityDawnCommanderDesc: 'You hit your stride at sunrise, commanding an army of tools',
  personalityMorningTeaTalker: 'Morning Tea Talker',
  personalityMorningTeaTalkerDesc: 'Mornings belong to unhurried conversation and thinking',
  personalityAfternoonSprinter: 'Afternoon Sprinter',
  personalityAfternoonSprinterDesc: 'Full throttle after noon — tool calls like a storm',
  personalitySteadyCraftsman: 'Steady Craftsman',
  personalitySteadyCraftsmanDesc: 'Afternoons spent polishing steadily, refining details through dialogue',
  /* ---------- v1.2.0：数据源分布 ---------- */
  sourceDistTitle: 'Data Sources',
  sourceDistSub: '{n} source(s)',
  sourceDsh: 'DSH',
  sourceClaudeCode: 'Claude Code',
  /* ---------- 其他 ---------- */
  empty: '—',
}

/** 文案表：语言 → 键 → 文案 */
export const STRINGS: Record<Lang, Record<string, string>> = { zh, en }

/** 中文文案表的键类型（渲染层动态构造 key 时用于类型收敛） */
export type StringsKey = keyof typeof zh

/** 年度对比指标 key（sessions/turns/...）→ 文案键（compareSessions/...） */
export function compareMetricKey(key: string): StringsKey {
  const map: Record<string, StringsKey> = {
    sessions: 'compareSessions',
    turns: 'compareTurns',
    toolCalls: 'compareToolCalls',
    activeDays: 'compareActiveDays',
    tokens: 'compareTokens',
  }
  return map[key] ?? 'empty'
}

/**
 * 取文案并替换 {name} 占位符。
 * 未知键返回键名本身（开发期显式暴露问题，不静默空串）。
 */
export function t(lang: Lang, key: keyof typeof zh, params?: Record<string, string | number>): string {
  let text: string = STRINGS[lang][key] ?? STRINGS.zh[key] ?? String(key)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}
