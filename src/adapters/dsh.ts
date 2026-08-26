/**
 * DSH（DeepSeek Harness）会话适配器
 *
 * 扫描 $DSH_HOME/sessions/<workspace>/<session-dir>/session.jsonl.zstd，
 * 流式解压并逐行映射为统一事件模型 NormalizedEvent。
 *
 * 关键事实（v2 提示词实测结论）：
 * - workspace 目录名不可解码出可靠路径，真实工作目录一律取 session 头 cwd
 * - 主/子代理判定以 session 头 origin 字段为准（目录名前缀仅作辅助）
 * - tool/call 的 data.arguments 是 JSON 字符串，需二次 parse
 * - tool/result 的 isError 在 data.message.content[0].content[0].isError 深层路径
 * - user/message 需过滤 <system-reminder> 开头的注入内容
 */
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { NormalizedEvent, RawSessionFile, SessionAdapter, SessionOrigin } from '../types.js'
import { streamZstdLines, readFirstZstdLine } from '../parser/zstd.js'
import { parseJsonlLine, parseToolArguments } from '../parser/jsonl.js'

/** 会话数据文件名 */
const SESSION_FILE = 'session.jsonl.zstd'

/** system-reminder 注入内容前缀 */
const INJECTED_PREFIX = '<system-reminder>'

/** 可安全忽略的事件类型（流式块与杂项，实测出现过） */
const IGNORED_TYPES = new Set<string>([
  'reasoning-chunks',
  'assistant/chunk',
  'tool-call-chunks',
  'text-chunks',
  'session/title',
  'session/title-llm-request',
  'session/end-seed',
  'todo/write',
  'agent/inbox/spliced',
  'permission/preset',
  'sandbox/mode',
  'approval/policy',
  'agent-preset/selected',
  'request/header',
  'request/context',
  // 以下类型无对应的统一事件：轮次计数用 turn/start，
  // 任务复杂度用 tool/call 自带的 step 字段（取每会话最大 step）
  'turn/end',
  'step/start',
  'step/end',
])

/** 工具分类映射（v2 提示词 3.5 节 + 实测补充；bash 未实测但保留映射） */
export const TOOL_CATEGORIES: Record<string, string> = {
  read: '📖 文件操作',
  write: '✏️ 代码产出',
  edit: '✏️ 代码产出',
  str_replace_editor: '✏️ 代码产出',
  glob: '🔍 文件搜索',
  grep: '🔍 内容搜索',
  bash: '🖥️ 命令执行',
  pwsh: '🖥️ 命令执行',
  pwd: '🖥️ 命令执行',
  job_list: '🖥️ 命令执行',
  job_output: '🖥️ 命令执行',
  job_kill: '🖥️ 命令执行',
  subagent: '🤖 代理委派',
  web_search: '🌐 信息检索',
  web_fetch: '🌐 信息检索',
  read_page: '🌐 信息检索',
  ask_user_question: '💬 人机交互',
  todo_write: '📋 任务管理',
  skill: '🧠 技能加载',
  read_image: '🖼️ 多媒体',
  describe_image: '🖼️ 多媒体',
  browser_navigate: '🌐 浏览器',
  browser_click: '🌐 浏览器',
  browser_snapshot: '🌐 浏览器',
}

/** 未知工具的归类 */
export const OTHER_CATEGORY = '📦 其他'

/** 获取工具分类 */
export function toolCategory(name: string): string {
  return TOOL_CATEGORIES[name] ?? OTHER_CATEGORY
}

/** 安全取有限数值，非数值返回 0 */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** 安全取字符串，非字符串返回 undefined / 空串 */
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** 判定是否为普通对象 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 会话头窥探结果（首行解析） */
export interface DshSessionHeader {
  id: string
  createdAt: number
  cwd: string
  origin: 'main' | 'subagent'
  agentPreset?: string
}

/** DSH 会话适配器实现 */
export class DshAdapter implements SessionAdapter {
  readonly id = 'dsh'

  /**
   * 扫描数据根目录（$DSH_HOME），收集全部含 session.jsonl.zstd 的会话目录。
   * 主会话与子代理会话都收集；统计阶段再按口径决定是否并入。
   */
  async scan(rootDir: string): Promise<RawSessionFile[]> {
    const sessionsDir = path.join(rootDir, 'sessions')
    let workspaceDirs: import('node:fs').Dirent[]
    try {
      workspaceDirs = await fs.readdir(sessionsDir, { withFileTypes: true })
    } catch {
      // sessions 目录不存在 → 无数据（由 CLI 层给出友好提示）
      return []
    }
    const files: RawSessionFile[] = []
    for (const ws of workspaceDirs) {
      if (!ws.isDirectory()) continue
      const wsPath = path.join(sessionsDir, ws.name)
      const sessionDirs = await fs.readdir(wsPath, { withFileTypes: true })
      for (const sd of sessionDirs) {
        if (!sd.isDirectory()) continue
        const filePath = path.join(wsPath, sd.name, SESSION_FILE)
        try {
          await fs.access(filePath)
        } catch {
          continue // 目录内无会话文件，跳过
        }
        // sessionId 先以目录名兜底，解析时以 session 头真实 id 为准
        files.push({ filePath, sessionId: sd.name, workspaceDir: ws.name })
      }
    }
    return files
  }

  /**
   * 窥探会话头（只解压首行），用于 CLI 在全量解析前统计主/子代理数与工作目录数。
   * 无法读取（损坏 / 空文件 / 解压工具缺失）返回 null。
   */
  async peekSessionHeader(file: RawSessionFile): Promise<DshSessionHeader | null> {
    const line = await readFirstZstdLine(file.filePath)
    if (line === null) return null
    let rec: unknown
    try {
      rec = JSON.parse(line)
    } catch {
      return null
    }
    if (!isRecord(rec) || rec.type !== 'session') return null
    const id = str(rec.id)
    const cwd = str(rec.cwd)
    if (!id || !cwd) return null
    const origin: SessionOrigin =
      rec.origin === 'subagent' || num(rec.delegationDepth) >= 1 ? 'subagent' : 'main'
    const agentPreset = str(rec.agentPreset)
    return {
      id,
      createdAt: num(rec.createdAt),
      cwd,
      origin,
      ...(agentPreset ? { agentPreset } : {}),
    }
  }

  /**
   * 解析单个会话文件，映射为 NormalizedEvent 逐个发出。
   * 解压失败（zstd 损坏等）时抛错，由上层警告并跳过该会话，不中断全局。
   */
  async parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void> {
    // 当前会话真实 id：session 头出现前用目录名兜底（正常数据首行即 session 头）
    let sessionId = file.sessionId
    const result = await streamZstdLines(file.filePath, (line) => {
      const obj = parseJsonlLine(line)
      if (!isRecord(obj)) return
      // session 头出现后，后续事件挂到真实 id 上
      mapDshLine(obj, () => sessionId, (id) => (sessionId = id), onEvent)
    })
    if (!result.ok) {
      throw new Error(
        `会话文件解压失败（${result.method}）: ${file.filePath}${result.error ? ' — ' + result.error : ''}`,
      )
    }
  }
}

/**
 * 将单行 DSH 原始记录映射为统一事件。
 * sessionId 通过 getter 读取（session 头可能在本行才更新真实 id）。
 * 导出供单测直接验证映射逻辑。
 */
export function mapDshLine(
  rec: Record<string, unknown>,
  getSessionId: () => string,
  setSessionId: (id: string) => void,
  onEvent: (e: NormalizedEvent) => void,
): void {
  const type = rec.type
  if (typeof type !== 'string' || IGNORED_TYPES.has(type)) return

  // session 头：字段在顶层（无 seq/time/data 包裹）
  if (type === 'session') {
    const id = str(rec.id)
    const createdAt = num(rec.createdAt)
    const cwd = str(rec.cwd)
    if (!id || !cwd) return // 关键字段缺失，丢弃该头
    setSessionId(id)
    // 主/子代理判定：origin 字段优先，delegationDepth >= 1 兜底
    const origin: SessionOrigin =
      rec.origin === 'subagent' || num(rec.delegationDepth) >= 1 ? 'subagent' : 'main'
    const agentPreset = str(rec.agentPreset)
    onEvent({
      kind: 'session-start',
      sessionId: id,
      createdAt,
      cwd,
      origin,
      ...(agentPreset ? { agentPreset } : {}),
    })
    return
  }

  const time = num(rec.time)
  const data = isRecord(rec.data) ? rec.data : {}

  switch (type) {
    case 'turn/start': {
      onEvent({ kind: 'turn-start', sessionId: getSessionId(), turn: num(data.turn), time })
      break
    }
    case 'user/message': {
      // content[] 中取 text 条目；任一条以 <system-reminder> 开头视为注入消息
      const contents = Array.isArray(data.content) ? data.content : []
      const texts: string[] = []
      for (const c of contents) {
        if (isRecord(c) && c.type === 'text' && typeof c.text === 'string') {
          texts.push(c.text)
        }
      }
      const isInjected = texts.some((t) => t.trimStart().startsWith(INJECTED_PREFIX))
      onEvent({
        kind: 'user-message',
        sessionId: getSessionId(),
        time,
        text: texts.join('\n'),
        isInjected,
      })
      break
    }
    case 'assistant/message': {
      const message = isRecord(data.message) ? data.message : {}
      // 统计 text 条目总长度（reasoning / tool-call 条目不计入）
      const contents = Array.isArray(message.content) ? message.content : []
      let textLength = 0
      for (const c of contents) {
        if (isRecord(c) && c.type === 'text' && typeof c.text === 'string') {
          textLength += c.text.length
        }
      }
      const source = isRecord(message.source) ? message.source : {}
      const model = str(source.model) || undefined
      // 真实 token 用量（camelCase 字段）；缺失时 usage 为 undefined，统计层将 tokens 置 null
      let usage: { input: number; output: number } | undefined
      if (isRecord(data.usage)) {
        const input = num(data.usage.inputTokens)
        const output = num(data.usage.outputTokens)
        if (typeof data.usage.inputTokens === 'number' && typeof data.usage.outputTokens === 'number') {
          usage = { input, output }
        }
      }
      onEvent({
        kind: 'assistant-message',
        sessionId: getSessionId(),
        time,
        ...(model ? { model } : {}),
        textLength,
        ...(usage ? { usage } : {}),
      })
      break
    }
    case 'tool/call': {
      onEvent({
        kind: 'tool-call',
        sessionId: getSessionId(),
        turn: num(data.turn),
        step: num(data.step),
        callId: str(data.callId),
        name: str(data.name),
        // arguments 是 JSON 字符串，需二次 parse；失败记为 {}
        args: parseToolArguments(data.arguments),
        time,
      })
      break
    }
    case 'tool/result': {
      // isError 在 data.message.content[0].isError（tool-result 条目上，与 content 数组平级；
      // 实测修正：v2 提示词 3.3 表格所写 content[0].content[0].isError 路径有误，
      // 其 3.4 样例本身即证实 isError 在上一层）
      const message = isRecord(data.message) ? data.message : {}
      const source = isRecord(message.source) ? message.source : {}
      const callId = str(source.callId)
      const contentArr = Array.isArray(message.content) ? message.content : []
      const first = contentArr.length > 0 ? contentArr[0] : undefined
      const isError = isRecord(first) && first.isError === true
      onEvent({ kind: 'tool-result', sessionId: getSessionId(), callId, isError, time })
      break
    }
    default:
      // 其余未知类型安全忽略
      break
  }
}
