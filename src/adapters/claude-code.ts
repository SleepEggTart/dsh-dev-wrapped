/**
 * Claude Code 会话适配器
 *
 * 扫描 $CLAUDE_HOME/projects/<编码cwd>/<sessionId>.jsonl（未压缩纯 JSONL），
 * 以及 <sessionId>/subagents/agent-*.jsonl 子代理会话文件，映射为统一事件模型。
 *
 * 关键事实（2026-08 本机实测结论，schema 无官方文档）：
 * - 无显式 session 头行：createdAt 取文件内首条带 timestamp 的行，cwd 取首个非空 cwd
 * - 时间戳为 ISO 8601 字符串（非 epoch 毫秒数）
 * - 同一 API 响应（message.id）拆成多行 JSONL（thinking / text / tool_use 各一行），
 *   usage 在各行重复携带 → 必须按 message.id 去重，且取最后一次出现的值（流式补全）
 * - 真实用户输入 message.content 为字符串；数组形态是 tool_result 或多块内容
 * - 注入消息以行级 isMeta=true 标记（DSH 的 <system-reminder> 前缀作兜底）
 * - 子代理不在主文件内，独立存于 <sessionId>/subagents/agent-*.jsonl，
 *   且行内 sessionId 复用主会话 id → 必须派生独立会话 id（父id::文件名主干）
 * - tool_use.id 与 tool_result.tool_use_id（"call_xxx"）互相关联
 * - token 口径：input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 *   （ccusage 社区标准，缺 cache 项会严重低估），output = output_tokens
 */
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import * as readline from 'node:readline'
import type {
  NormalizedEvent,
  RawSessionFile,
  SessionAdapter,
  SessionHeader,
  SessionOrigin,
} from '../types.js'
import { parseJsonlLine } from '../parser/jsonl.js'

/** 子代理派生会话 id 的分隔符：父会话id::子代理文件主干 */
const SUBAGENT_SEP = '::'

/** 注入内容前缀（isMeta 之外的内容级兜底） */
const INJECTED_PREFIXES = ['<system-reminder>', '<command-', '<local-command-']

/** peekSessionHeader 最多读取的行数（首条消息通常在前几行） */
const PEEK_MAX_LINES = 50

/** 安全取字符串，非字符串返回空串 */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 判定是否为普通对象 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 解析 ISO 8601 时间戳字符串为 epoch 毫秒；缺失/非法返回 null */
function parseTimestamp(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/**
 * 归一化 Claude Code usage 为统一口径。
 * input 含 cache 读/写命中（ccusage 社区标准）；字段缺失返回 undefined。
 */
function normalizeUsage(u: Record<string, unknown>): { input: number; output: number } | undefined {
  const input = u.input_tokens
  const output = u.output_tokens
  if (typeof input !== 'number' || typeof output !== 'number') return undefined
  const cacheRead = typeof u.cache_read_input_tokens === 'number' ? u.cache_read_input_tokens : 0
  const cacheCreate =
    typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0
  return { input: input + cacheRead + cacheCreate, output }
}

/** 判定用户文本是否为注入内容 */
function isInjectedText(text: string): boolean {
  const t = text.trimStart()
  return INJECTED_PREFIXES.some((p) => t.startsWith(p))
}

/** 从文件路径派生会话 id 与归属（subagents 路径下的为子代理） */
function deriveIdentity(filePath: string, fallbackSessionId: string): {
  sessionId: string
  origin: SessionOrigin
} {
  const normalized = filePath.split(/[\\/]/)
  const idx = normalized.lastIndexOf('subagents')
  if (idx >= 1) {
    // .../<parentSessionId>/subagents/agent-xxx.jsonl
    // 主干取自文件路径（幂等：scan 已派生的 id 再推导结果不变）
    const parent = normalized[idx - 1]
    const stem = path.basename(filePath, '.jsonl')
    return { sessionId: `${parent}${SUBAGENT_SEP}${stem}`, origin: 'subagent' }
  }
  return { sessionId: fallbackSessionId, origin: 'main' }
}

/** Claude Code 会话适配器实现 */
export class ClaudeCodeAdapter implements SessionAdapter {
  readonly id = 'claude-code'

  /**
   * 扫描数据根目录（$CLAUDE_HOME）：
   * - projects/<proj>/*.jsonl → 主会话（sessionId = 文件名主干）
   * - projects/<proj>/<sid>/subagents/agent-*.jsonl → 子代理会话（派生 id）
   * memory/、tool-results/、sessions-index.json 等非会话内容忽略。
   */
  async scan(rootDir: string): Promise<RawSessionFile[]> {
    const projectsDir = path.join(rootDir, 'projects')
    let projectDirs: import('node:fs').Dirent[]
    try {
      projectDirs = await fs.readdir(projectsDir, { withFileTypes: true })
    } catch {
      // projects 目录不存在 → 无数据（由 CLI 层给出友好提示）
      return []
    }
    const files: RawSessionFile[] = []
    for (const proj of projectDirs) {
      if (!proj.isDirectory()) continue
      const projPath = path.join(projectsDir, proj.name)
      const entries = await fs.readdir(projPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) {
          files.push({
            filePath: path.join(projPath, e.name),
            sessionId: e.name.slice(0, -'.jsonl'.length),
            workspaceDir: proj.name,
          })
        } else if (e.isDirectory() && e.name !== 'memory') {
          // 会话附属目录：<sessionId>/subagents/ 内是子代理会话文件
          const subDir = path.join(projPath, e.name, 'subagents')
          let subs: import('node:fs').Dirent[]
          try {
            subs = await fs.readdir(subDir, { withFileTypes: true })
          } catch {
            continue
          }
          for (const s of subs) {
            if (s.isFile() && s.name.endsWith('.jsonl')) {
              files.push({
                filePath: path.join(subDir, s.name),
                sessionId: `${e.name}${SUBAGENT_SEP}${s.name.slice(0, -'.jsonl'.length)}`,
                workspaceDir: proj.name,
              })
            }
          }
        }
      }
    }
    return files
  }

  /**
   * 窥探会话头（流式读前若干行，取首个 timestamp 与 cwd）。
   * 无法读取（空文件 / 无带时间戳的行）返回 null。
   */
  async peekSessionHeader(file: RawSessionFile): Promise<SessionHeader | null> {
    const { sessionId, origin } = deriveIdentity(file.filePath, file.sessionId)
    let createdAt: number | null = null
    let cwd = ''
    let count = 0
    for await (const line of lineStream(file.filePath)) {
      if (++count > PEEK_MAX_LINES) break
      const rec = parseJsonlLine(line)
      if (!isRecord(rec)) continue
      if (createdAt === null) createdAt = parseTimestamp(rec.timestamp)
      if (!cwd && typeof rec.cwd === 'string' && rec.cwd) cwd = rec.cwd
      if (createdAt !== null && cwd) break
    }
    if (createdAt === null || !cwd) return null
    return { id: sessionId, createdAt, cwd, origin }
  }

  /**
   * 解析单个会话文件，映射为 NormalizedEvent 逐个发出。
   * 读文件失败（文件被删除等）抛错，由上层警告并跳过该会话。
   *
   * 实现说明：事件先缓冲、文件读完后统一发出——
   * 因为同一 message.id 跨多行携带的 usage 需以最后一次为准（流式补全），
   * 缓冲期间可直接原地更新已建事件对象的 usage 字段。
   */
  async parse(file: RawSessionFile, onEvent: (e: NormalizedEvent) => void): Promise<void> {
    const { sessionId, origin } = deriveIdentity(file.filePath, file.sessionId)

    // 会话头要素：首条带时间戳的行 + 首个非空 cwd（二者可能不在同一行）
    let headerCreatedAt: number | null = null
    let headerCwd = ''

    const events: NormalizedEvent[] = []
    // message.id → 已建的 assistant-message 事件（usage 去重 + 最后一次覆盖）
    const msgEvents = new Map<
      string,
      Extract<NormalizedEvent, { kind: 'assistant-message' }>
    >()
    let turn = 0 // 真实用户消息数（即轮数口径）
    let step = 0 // 会话内 tool-call 递增步骤号

    /** 处理用户文本：注入判定 + 轮数计数（仅真实消息计轮并发 turn-start） */
    const handleUserText = (text: string, isMeta: boolean, ts: number): void => {
      const injected = isMeta || isInjectedText(text)
      if (!injected) {
        turn++
        events.push({ kind: 'turn-start', sessionId, turn, time: ts })
      }
      events.push({ kind: 'user-message', sessionId, time: ts, text, isInjected: injected })
    }

    for await (const line of lineStream(file.filePath)) {
      const rec = parseJsonlLine(line)
      if (!isRecord(rec)) continue
      const type = rec.type
      if (type !== 'user' && type !== 'assistant') continue // 其余行类型无统计价值

      const time = parseTimestamp(rec.timestamp)
      if (headerCreatedAt === null && time !== null) headerCreatedAt = time
      if (!headerCwd && typeof rec.cwd === 'string' && rec.cwd) headerCwd = rec.cwd
      const ts = time ?? 0

      const message = isRecord(rec.message) ? rec.message : {}
      const content = message.content

      if (type === 'user') {
        if (Array.isArray(content)) {
          // 数组形态：tool_result 块或文本块
          const texts: string[] = []
          for (const b of content) {
            if (!isRecord(b)) continue
            if (b.type === 'tool_result') {
              events.push({
                kind: 'tool-result',
                sessionId,
                callId: str(b.tool_use_id),
                isError: b.is_error === true || b.isError === true,
                time: ts,
              })
            } else if (b.type === 'text' && typeof b.text === 'string') {
              texts.push(b.text)
            }
          }
          if (texts.length > 0) handleUserText(texts.join('\n'), rec.isMeta === true, ts)
        } else if (typeof content === 'string') {
          handleUserText(content, rec.isMeta === true, ts)
        }
      } else {
        // assistant：thinking / text / tool_use 块；usage 按 message.id 去重
        const msgKey = str(message.id) || str(rec.uuid)
        const blocks = Array.isArray(content) ? content : []
        let textLength = 0
        for (const b of blocks) {
          if (!isRecord(b)) continue
          if (b.type === 'tool_use') {
            step++
            events.push({
              kind: 'tool-call',
              sessionId,
              turn,
              step,
              callId: str(b.id),
              name: str(b.name),
              args: isRecord(b.input) ? b.input : {},
              time: ts,
            })
          } else if (b.type === 'text' && typeof b.text === 'string') {
            textLength += b.text.length
          }
        }
        const model = str(message.model) || undefined
        const usage = isRecord(message.usage) ? normalizeUsage(message.usage) : undefined
        const existing = msgEvents.get(msgKey)
        if (existing) {
          // 同一 message.id 的后续行：累加文本长度，usage 取最后一次（更完整）
          existing.textLength += textLength
          if (usage) existing.usage = usage
        } else {
          const ev: Extract<NormalizedEvent, { kind: 'assistant-message' }> = {
            kind: 'assistant-message',
            sessionId,
            time: ts,
            ...(model ? { model } : {}),
            textLength,
            ...(usage ? { usage } : {}),
          }
          msgEvents.set(msgKey, ev)
          events.push(ev)
        }
      }
    }

    // 统一发出：session 头在前（两要素齐备才发；纯元数据行文件不发头，统计层自然忽略）
    if (headerCreatedAt !== null && headerCwd) {
      onEvent({
        kind: 'session-start',
        sessionId,
        createdAt: headerCreatedAt,
        cwd: headerCwd,
        origin,
        source: 'claude-code',
      })
    }
    for (const e of events) onEvent(e)
  }
}

/** 逐行流式读取文件（UTF-8） */
function lineStream(filePath: string): readline.Interface {
  return readline.createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Number.POSITIVE_INFINITY,
  })
}
