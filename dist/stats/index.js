import { toolCategory } from '../tools.js';
import { computeBadges } from '../badges.js';
import { computePersonality } from '../personality.js';
/** 从事件流聚合报告 */
export function aggregate(events, opts = {}) {
    const includeSub = opts.includeSubagents ?? false;
    // ---------- 第一遍：收集 session 头，做日期过滤 ----------
    const sessionHeads = new Map();
    for (const e of events) {
        if (e.kind === 'session-start') {
            sessionHeads.set(e.sessionId, {
                createdAt: e.createdAt,
                cwd: e.cwd,
                origin: e.origin,
                ...(e.agentPreset ? { agentPreset: e.agentPreset } : {}),
                ...(e.source ? { source: e.source } : {}),
            });
        }
    }
    // 日期过滤：以 session 的 createdAt 为基准（until 含当天）
    const keptSessionIds = new Set();
    for (const [id, head] of sessionHeads) {
        if (opts.since !== undefined && head.createdAt < opts.since)
            continue;
        if (opts.until !== undefined && head.createdAt > opts.until)
            continue;
        keptSessionIds.add(id);
    }
    // ---------- 第二遍：逐会话聚合 ----------
    const sessions = new Map();
    const toolUsageAll = new Map(); // 工具总调用（主 + 可选子代理）
    const hourly = new Array(24).fill(0);
    const weekday = new Array(7).fill(0); // 0=周一 … 6=周日（本地时区）
    const dailyToolCalls = new Map(); // 'YYYY-MM-DD' → toolCalls
    const dailySessions = new Map(); // 'YYYY-MM-DD' → 会话 id 集合
    const filesRead = new Set();
    const filesWritten = new Set();
    const extCounts = new Map();
    const modelCounts = new Map(); // 模型 → assistant 消息数
    // 工具名 → isError 次数（阶段五：工具错误率）
    const toolErrors = new Map();
    let totalTurns = 0;
    let totalUserMessages = 0;
    let tokensInput = 0;
    let tokensOutput = 0;
    let tokensMissing = false;
    // callId → { 会话, 工具名 }（tool-result 归属与错误率关联回 tool-call）
    const callIdToInfo = new Map();
    const getSession = (id, fallbackTime) => {
        // 日期过滤外的会话事件不统计
        if (!keptSessionIds.has(id))
            return null;
        // 主会话始终参与；子代理按开关并入工具统计
        const head = sessionHeads.get(id);
        if (!head)
            return null;
        if (head.origin === 'subagent' && !includeSub)
            return null;
        let agg = sessions.get(id);
        if (!agg) {
            agg = {
                id,
                cwd: head.cwd,
                createdAt: head.createdAt,
                origin: head.origin,
                turns: 0,
                toolCalls: 0,
                lastTime: head.createdAt,
                toolCounts: new Map(),
                maxStep: 0,
            };
            sessions.set(id, agg);
        }
        if (fallbackTime > agg.lastTime)
            agg.lastTime = fallbackTime;
        return agg;
    };
    /** 本地时区 'YYYY-MM-DD' */
    const localDateKey = (time) => {
        const d = new Date(time);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    };
    /** 从文件路径提取扩展名（小写，无扩展名返回 null） */
    const extOf = (filePath) => {
        const base = filePath.split(/[\\/]/).pop() ?? '';
        const dot = base.lastIndexOf('.');
        if (dot <= 0 || dot === base.length - 1)
            return null; // 无扩展名 / 隐藏文件 / 以 . 结尾
        return base.slice(dot + 1).toLowerCase();
    };
    for (const e of events) {
        switch (e.kind) {
            case 'turn-start': {
                const agg = getSession(e.sessionId, e.time);
                if (agg && e.turn > agg.turns)
                    agg.turns = e.turn; // turn 递增，取最大值即轮数
                break;
            }
            case 'user-message': {
                const agg = getSession(e.sessionId, e.time);
                if (agg && !e.isInjected)
                    totalUserMessages++;
                break;
            }
            case 'assistant-message': {
                const agg = getSession(e.sessionId, e.time);
                if (!agg)
                    break;
                if (e.model)
                    modelCounts.set(e.model, (modelCounts.get(e.model) ?? 0) + 1);
                if (e.usage) {
                    tokensInput += e.usage.input;
                    tokensOutput += e.usage.output;
                }
                else {
                    // 口径：任何一条缺失即整体为 null（不估算）
                    tokensMissing = true;
                }
                break;
            }
            case 'tool-call': {
                const agg = getSession(e.sessionId, e.time);
                if (!agg)
                    break;
                agg.toolCalls++;
                agg.toolCounts.set(e.name, (agg.toolCounts.get(e.name) ?? 0) + 1);
                toolUsageAll.set(e.name, (toolUsageAll.get(e.name) ?? 0) + 1);
                callIdToInfo.set(e.callId, { sessionId: e.sessionId, toolName: e.name });
                const localTime = new Date(e.time);
                hourly[localTime.getHours()]++;
                // getDay(): 0=周日；换算为 0=周一 … 6=周日
                weekday[(localTime.getDay() + 6) % 7]++;
                dailyToolCalls.set(localDateKey(e.time), (dailyToolCalls.get(localDateKey(e.time)) ?? 0) + 1);
                if (e.step > agg.maxStep)
                    agg.maxStep = e.step;
                // 文件路径提取（read/write/edit 的 file_path 参数）；
                // 工具名比较统一小写：DSH 为 read/write，Claude Code 为 Read/Write/MultiEdit 等
                const fp = typeof e.args.file_path === 'string' ? e.args.file_path : undefined;
                if (fp) {
                    const tool = e.name.toLowerCase();
                    if (tool === 'read') {
                        filesRead.add(fp);
                    }
                    else if (tool === 'write' ||
                        tool === 'edit' ||
                        tool === 'multiedit' ||
                        tool === 'notebookedit' ||
                        tool === 'str_replace_editor') {
                        filesWritten.add(fp);
                    }
                    const ext = extOf(fp);
                    if (ext) {
                        extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
                    }
                }
                break;
            }
            case 'tool-result': {
                // tool-result 通过 callId 关联到 tool-call 所属会话（已含过滤逻辑）
                const info = callIdToInfo.get(e.callId);
                if (info) {
                    getSession(info.sessionId, e.time);
                    // 阶段五：isError 计入对应工具错误数（仅统计已归属会话的错误）
                    if (e.isError && keptSessionIds.has(info.sessionId)) {
                        const head = sessionHeads.get(info.sessionId);
                        if (head && (head.origin === 'main' || includeSub)) {
                            toolErrors.set(info.toolName, (toolErrors.get(info.toolName) ?? 0) + 1);
                        }
                    }
                }
                break;
            }
            case 'session-start':
                // 头已在第一遍处理；这里只需登记日活
                break;
        }
    }
    // 日活登记：每个保留会话按其 createdAt 计入当天（子代理不计入日活会话数）
    for (const id of keptSessionIds) {
        const head = sessionHeads.get(id);
        if (head.origin === 'subagent')
            continue;
        const key = localDateKey(head.createdAt);
        let set = dailySessions.get(key);
        if (!set) {
            set = new Set();
            dailySessions.set(key, set);
        }
        set.add(id);
    }
    // ---------- 主会话集合（不含子代理） ----------
    const mainSessions = [...sessions.values()].filter((s) => s.origin === 'main');
    // 会话总数口径：日期过滤内、非子代理的会话数（无论 includeSubagents）
    const totalSessions = [...keptSessionIds].filter((id) => sessionHeads.get(id)?.origin === 'main').length;
    for (const s of mainSessions) {
        totalTurns += s.turns;
    }
    // 工具总调用数：主会话 + （可选）子代理
    let totalToolCalls = 0;
    for (const s of sessions.values())
        totalToolCalls += s.toolCalls;
    // ---------- 亮点 ----------
    const longest = mainSessions.reduce((best, s) => best === null || s.lastTime - s.createdAt > best.lastTime - best.createdAt ? s : best, null);
    const mostComplex = mainSessions.reduce((best, s) => (best === null || s.maxStep > best.maxStep ? s : best), null);
    let favoriteTool = null;
    let favToolCount = 0;
    for (const [name, count] of toolUsageAll) {
        if (count > favToolCount) {
            favoriteTool = name;
            favToolCount = count;
        }
    }
    // 最爱项目：主会话中 toolCalls 最多的 cwd
    const cwdToolCounts = new Map();
    for (const s of mainSessions) {
        cwdToolCounts.set(s.cwd, (cwdToolCounts.get(s.cwd) ?? 0) + s.toolCalls);
    }
    let favoriteWorkspace = null;
    let favWsCount = 0;
    for (const [ws, count] of cwdToolCounts) {
        if (count > favWsCount) {
            favoriteWorkspace = ws;
            favWsCount = count;
        }
    }
    // ---------- 时间线 ----------
    // 日期集合取并集：会话创建日 ∪ 工具调用日
    // （跨天 resume 的会话：创建日之外的后续活动日也应有记录）
    const allDays = new Set([...dailySessions.keys(), ...dailyToolCalls.keys()]);
    const dailyActivity = [...allDays]
        .map((date) => ({
        date,
        sessions: dailySessions.get(date)?.size ?? 0,
        toolCalls: dailyToolCalls.get(date) ?? 0,
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
    let peakHour = null;
    let peakHourCount = -1;
    hourly.forEach((c, h) => {
        if (c > peakHourCount) {
            peakHourCount = c;
            peakHour = h;
        }
    });
    if (peakHourCount <= 0)
        peakHour = null;
    let peakDay = null;
    let peakDayCount = -1;
    for (const d of dailyActivity) {
        if (d.toolCalls > peakDayCount) {
            peakDayCount = d.toolCalls;
            peakDay = d.date;
        }
    }
    if (peakDayCount <= 0)
        peakDay = null;
    // 时间范围：保留会话的最早 createdAt 与最后事件时间
    let rangeStart = Number.POSITIVE_INFINITY;
    let rangeEnd = 0;
    for (const s of sessions.values()) {
        if (s.createdAt < rangeStart)
            rangeStart = s.createdAt;
        if (s.lastTime > rangeEnd)
            rangeEnd = s.lastTime;
    }
    if (!Number.isFinite(rangeStart)) {
        rangeStart = 0;
        rangeEnd = 0;
    }
    const days = rangeEnd > 0 ? Math.max(1, Math.ceil((rangeEnd - rangeStart) / 86_400_000)) : 0;
    // ---------- 工具排行 ----------
    const toolUsage = [...toolUsageAll.entries()]
        .map(([name, count]) => ({ name, count, category: toolCategory(name) }))
        .sort((a, b) => b.count - a.count);
    // ---------- 阶段五：统计深化 ----------
    // 工具错误率排行：仅含有错误记录的工具，按 errors 降序（错误率 = errors / 该工具总调用）
    const toolErrorStats = [...toolErrors.entries()]
        .map(([name, errors]) => {
        const calls = toolUsageAll.get(name) ?? errors;
        return { name, errors, calls, errorRate: Math.round((errors / calls) * 10_000) / 10_000 };
    })
        .sort((a, b) => b.errors - a.errors);
    // 深夜占比：0-6 点（含）tool-call / 总调用；无调用时为 null
    let toolCallTotal = 0;
    for (const c of hourly)
        toolCallTotal += c;
    let lateNightCalls = 0;
    for (let h = 0; h <= 6; h++)
        lateNightCalls += hourly[h];
    const lateNightRatio = toolCallTotal > 0 ? Math.round((lateNightCalls / toolCallTotal) * 10_000) / 10_000 : null;
    // 模型分布：按消息数降序
    const models = [...modelCounts.entries()]
        .map(([model, messages]) => ({ model, messages }))
        .sort((a, b) => b.messages - a.messages);
    // DSH agentPreset 分布：按主会话数降序（非 DSH 数据源无此字段，为空数组）
    const presetCounts = new Map();
    for (const id of keptSessionIds) {
        const head = sessionHeads.get(id);
        if (head.origin !== 'main' || !head.agentPreset)
            continue;
        presetCounts.set(head.agentPreset, (presetCounts.get(head.agentPreset) ?? 0) + 1);
    }
    const agentPresets = [...presetCounts.entries()]
        .map(([preset, count]) => ({ preset, sessions: count }))
        .sort((a, b) => b.sessions - a.sessions);
    // ---------- topSessions（主会话按 toolCalls 排序 TOP5） ----------
    const topSessions = [...mainSessions]
        .sort((a, b) => b.toolCalls - a.toolCalls)
        .slice(0, 5)
        .map((s) => ({
        id: s.id,
        workspace: s.cwd,
        createdAt: s.createdAt,
        turns: s.turns,
        toolCalls: s.toolCalls,
        topTools: [...s.toolCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name),
    }));
    // ---------- highlights ----------
    const highlights = {
        longestSession: longest
            ? {
                id: longest.id,
                turns: longest.turns,
                toolCalls: longest.toolCalls,
                durationMs: longest.lastTime - longest.createdAt,
                workspace: longest.cwd,
            }
            : null,
        mostComplexTask: mostComplex
            ? {
                sessionId: mostComplex.id,
                totalSteps: mostComplex.maxStep,
                uniqueTools: [...mostComplex.toolCounts.keys()].sort(),
            }
            : null,
        favoriteTool,
        favoriteWorkspace,
    };
    // ---------- 汇总 ----------
    // 活跃天数与 dailyActivity 口径一致：会话创建日 ∪ 工具调用日
    const activeDays = allDays.size;
    const report = {
        generatedAt: Date.now(),
        dshHome: '', // 由 CLI 层填充
        adapterId: 'dsh',
        badges: [], // 占位，下方 computeBadges 统一填充
        adapterSources: [], // 占位，下方聚合数据源分布
        personality: null, // 占位，下方 computePersonality 填充
        timeRange: { start: rangeStart, end: rangeEnd, days },
        overview: {
            totalSessions,
            totalTurns,
            totalToolCalls,
            totalUserMessages,
            activeDays,
            tokens: tokensMissing ? null : { input: tokensInput, output: tokensOutput },
        },
        fileOps: {
            filesRead: filesRead.size,
            filesWritten: filesWritten.size,
            topFileExtensions: [...extCounts.entries()]
                .map(([ext, count]) => ({ ext, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
        },
        toolUsage,
        toolErrors: toolErrorStats,
        models,
        agentPresets,
        timeline: {
            hourlyActivity: hourly,
            dailyActivity,
            peakHour,
            peakDay,
            weekdayActivity: weekday,
            lateNightRatio,
        },
        highlights,
        topSessions,
    };
    // 成就徽章：报告构造完成后统一计算（badges 依赖完整报告数据）
    report.badges = computeBadges(report);
    // 数据源分布：按保留的主会话归属统计（--adapter all 时多元素）
    const sourceCounts = new Map();
    for (const id of keptSessionIds) {
        const head = sessionHeads.get(id);
        if (head.origin !== 'main')
            continue;
        const src = head.source ?? 'dsh';
        sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }
    report.adapterSources = [...sourceCounts.entries()]
        .map(([source, count]) => ({ source, sessions: count }))
        .sort((a, b) => b.sessions - a.sessions);
    // 开发者人格画像：工具调用总数 > 0 时计算
    report.personality = computePersonality(report);
    return report;
}
