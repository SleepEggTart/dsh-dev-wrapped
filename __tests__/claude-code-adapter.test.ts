/**
 * Claude Code 适配器单测
 *
 * 用临时目录构造最小固定样例（主会话 + 子代理 + memory 等干扰项），
 * 验证 scan / parse / peekSessionHeader 的映射逻辑与统计聚合集成：
 * - usage 按 message.id 去重（同一响应多行携带），最后一次为准，input 含 cache 项
 * - isMeta / <system-reminder> 注入消息不计轮数、不计用户消息
 * - 子代理派生独立会话 id（父id::文件名主干），行内 sessionId 复用父 id 不混入
 * - is_error 错误标志识别
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ClaudeCodeAdapter } from '../src/adapters/claude-code.js'
import { aggregate } from '../src/stats/index.js'
import type { NormalizedEvent } from '../src/types.js'

/** 主会话固定样例（字段结构来自 2026-08 本机实测） */
const MAIN_LINES = [
  // 首行无时间戳的元数据行：不产生事件，也不影响会话头
  '{"type":"permission-mode","permissionMode":"default","sessionId":"abc123"}',
  // 真实用户输入（字符串 content）
  '{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":"你好，帮我看看项目"},"uuid":"u1","timestamp":"2026-07-01T02:00:00.000Z","cwd":"D:\\\\proj","sessionId":"abc123","version":"2.1.148"}',
  // isMeta 注入消息：不计轮数
  '{"type":"user","isMeta":true,"message":{"role":"user","content":"<system-reminder>hook 注入</system-reminder>"},"uuid":"u2","timestamp":"2026-07-01T02:00:01.000Z","cwd":"D:\\\\proj"}',
  // 同一 message.id（msg_1）拆两行：thinking 行 + text 行，usage 最后一次为准（含 cache）
  '{"parentUuid":"u1","type":"assistant","message":{"id":"msg_1","role":"assistant","model":"claude-x","content":[{"type":"thinking","thinking":"想想"}],"usage":{"input_tokens":100,"output_tokens":0}},"uuid":"a1","timestamp":"2026-07-01T02:00:02.000Z","cwd":"D:\\\\proj"}',
  '{"parentUuid":"a1","type":"assistant","message":{"id":"msg_1","role":"assistant","model":"claude-x","content":[{"type":"text","text":"我来看看"}],"usage":{"input_tokens":100,"cache_read_input_tokens":50,"cache_creation_input_tokens":10,"output_tokens":73}},"uuid":"a2","timestamp":"2026-07-01T02:00:03.000Z","cwd":"D:\\\\proj"}',
  // tool_use（Read）→ tool-call
  '{"parentUuid":"a2","type":"assistant","message":{"id":"msg_2","role":"assistant","model":"claude-x","content":[{"type":"tool_use","id":"call_t1","name":"Read","input":{"file_path":"D:\\\\proj\\\\a.ts"}}],"usage":{"input_tokens":200,"output_tokens":5}},"uuid":"a3","timestamp":"2026-07-01T02:00:04.000Z","cwd":"D:\\\\proj"}',
  // tool_result（数组 content，无 is_error）
  '{"parentUuid":"a3","type":"user","message":{"role":"user","content":[{"tool_use_id":"call_t1","type":"tool_result","content":"file content"}]},"uuid":"u3","timestamp":"2026-07-01T02:00:05.000Z","cwd":"D:\\\\proj"}',
  // tool_use（Bash）+ 错误结果
  '{"parentUuid":"u3","type":"assistant","message":{"id":"msg_3","role":"assistant","model":"claude-x","content":[{"type":"tool_use","id":"call_t2","name":"Bash","input":{"command":"ls"}}],"usage":{"input_tokens":300,"output_tokens":5}},"uuid":"a4","timestamp":"2026-07-01T02:00:06.000Z","cwd":"D:\\\\proj"}',
  '{"parentUuid":"a4","type":"user","message":{"role":"user","content":[{"tool_use_id":"call_t2","type":"tool_result","content":"boom","is_error":true}]},"uuid":"u4","timestamp":"2026-07-01T02:00:07.000Z","cwd":"D:\\\\proj"}',
]

/** 子代理固定样例：行内 sessionId 复用主会话 id（关键陷阱） */
const SUB_LINES = [
  '{"type":"user","message":{"role":"user","content":"搜索文档"},"uuid":"s1","timestamp":"2026-07-01T03:00:00.000Z","cwd":"D:\\\\proj\\\\sub","sessionId":"abc123","isSidechain":true}',
  '{"type":"assistant","message":{"id":"msg_s1","role":"assistant","model":"claude-x","content":[{"type":"tool_use","id":"call_s1","name":"Grep","input":{"pattern":"foo"}}],"usage":{"input_tokens":10,"output_tokens":2}},"uuid":"s2","timestamp":"2026-07-01T03:00:01.000Z","cwd":"D:\\\\proj\\\\sub","isSidechain":true}',
]

const T0 = Date.parse('2026-07-01T02:00:00.000Z')

let root: string
let adapter: ClaudeCodeAdapter

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ccw-test-'))
  adapter = new ClaudeCodeAdapter()
  // 目录结构：projects/<proj>/ 主会话 + 子代理 + 干扰项
  const projDir = path.join(root, 'projects', 'D--proj')
  const subDir = path.join(projDir, 'abc123', 'subagents')
  await fs.mkdir(subDir, { recursive: true })
  await fs.mkdir(path.join(projDir, 'memory'), { recursive: true })
  await fs.writeFile(path.join(projDir, 'abc123.jsonl'), MAIN_LINES.join('\n') + '\n', 'utf8')
  await fs.writeFile(path.join(subDir, 'agent-xyz.jsonl'), SUB_LINES.join('\n') + '\n', 'utf8')
  await fs.writeFile(path.join(projDir, 'memory', 'MEMORY.md'), '# memory', 'utf8')
  await fs.writeFile(path.join(projDir, 'sessions-index.json'), '{}', 'utf8')
})

afterEach(async () => {
  // Windows + Node 18 存在目录句柄延迟释放的竞态，rmdir 可能报 ENOTEMPTY，加重试兜底
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** 解析全部文件并收集事件（顺序：文件按 scan 返回顺序） */
async function parseAll(): Promise<NormalizedEvent[]> {
  const files = await adapter.scan(root)
  const events: NormalizedEvent[] = []
  for (const f of files) {
    await adapter.parse(f, (e) => events.push(e))
  }
  return events
}

describe('scan 扫描', () => {
  it('收集主会话与子代理文件，忽略 memory 与 sessions-index', async () => {
    const files = await adapter.scan(root)
    const ids = files.map((f) => f.sessionId).sort()
    expect(ids).toEqual(['abc123', 'abc123::agent-xyz'])
  })

  it('数据目录不存在时返回空数组', async () => {
    expect(await adapter.scan(path.join(root, 'nonexistent'))).toEqual([])
  })
})

describe('parse 主会话映射', () => {
  it('会话头由首条带时间戳的行合成（createdAt + cwd）', async () => {
    const events = await parseAll()
    const head = events.find((e) => e.kind === 'session-start' && e.sessionId === 'abc123')
    expect(head).toMatchObject({
      kind: 'session-start',
      sessionId: 'abc123',
      createdAt: T0,
      cwd: 'D:\\proj',
      origin: 'main',
    })
  })

  it('真实用户消息计轮，isMeta 注入消息不计轮不计用户消息', async () => {
    const events = await parseAll()
    const turns = events.filter((e) => e.kind === 'turn-start' && e.sessionId === 'abc123')
    const users = events.filter((e) => e.kind === 'user-message' && e.sessionId === 'abc123')
    expect(turns).toHaveLength(1)
    expect((turns[0] as { turn: number }).turn).toBe(1)
    expect(users).toHaveLength(2)
    expect((users[0] as { isInjected: boolean }).isInjected).toBe(false)
    expect((users[1] as { isInjected: boolean }).isInjected).toBe(true)
  })

  it('同一 message.id 多行只产生一条 assistant-message，usage 取最后一次且 input 含 cache 项', async () => {
    const events = await parseAll()
    const msgs = events.filter(
      (e) => e.kind === 'assistant-message' && e.sessionId === 'abc123',
    ) as Array<{ usage?: { input: number; output: number } }>
    expect(msgs).toHaveLength(3) // msg_1 + msg_2 + msg_3
    // msg_1 最终 usage：input = 100 + cache_read 50 + cache_creation 10 = 160，output = 73
    expect(msgs[0].usage).toEqual({ input: 160, output: 73 })
    expect(msgs[1].usage).toEqual({ input: 200, output: 5 })
    expect(msgs[2].usage).toEqual({ input: 300, output: 5 })
  })

  it('tool_use 映射为 tool-call（保留原始工具名与参数），tool_result 关联 callId 并识别 is_error', async () => {
    const events = await parseAll()
    const calls = events.filter(
      (e) => e.kind === 'tool-call' && e.sessionId === 'abc123',
    ) as Array<{ callId: string; name: string; args: Record<string, unknown>; step: number; turn: number }>
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ callId: 'call_t1', name: 'Read', step: 1, turn: 1 })
    expect(calls[0].args).toEqual({ file_path: 'D:\\proj\\a.ts' })
    expect(calls[1]).toMatchObject({ callId: 'call_t2', name: 'Bash', step: 2 })

    const results = events.filter(
      (e) => e.kind === 'tool-result' && e.sessionId === 'abc123',
    ) as Array<{ callId: string; isError: boolean }>
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ callId: 'call_t1', isError: false })
    expect(results[1]).toMatchObject({ callId: 'call_t2', isError: true })
  })

  it('解析不存在的文件抛错（由上层跳过）', async () => {
    await expect(
      adapter.parse(
        { filePath: path.join(root, 'ghost.jsonl'), sessionId: 'ghost', workspaceDir: 'x' },
        () => {},
      ),
    ).rejects.toThrow()
  })
})

describe('parse 子代理映射', () => {
  it('子代理派生独立会话 id 并标记 origin=subagent，不混入主会话', async () => {
    const events = await parseAll()
    const head = events.find(
      (e) => e.kind === 'session-start' && e.sessionId === 'abc123::agent-xyz',
    )
    expect(head).toMatchObject({
      sessionId: 'abc123::agent-xyz',
      cwd: 'D:\\proj\\sub',
      origin: 'subagent',
    })
    // 子代理的 tool-call 挂在派生 id 上（行内 sessionId 是父 id，不得采用）
    const subCall = events.find(
      (e) => e.kind === 'tool-call' && e.sessionId === 'abc123::agent-xyz',
    ) as { name: string } | undefined
    expect(subCall?.name).toBe('Grep')
  })
})

describe('peekSessionHeader 窥探', () => {
  it('主会话返回首条时间戳与 cwd', async () => {
    const files = await adapter.scan(root)
    const main = files.find((f) => f.sessionId === 'abc123')!
    expect(await adapter.peekSessionHeader(main)).toEqual({
      id: 'abc123',
      createdAt: T0,
      cwd: 'D:\\proj',
      origin: 'main',
    })
  })

  it('子代理返回派生 id 与 subagent 归属', async () => {
    const files = await adapter.scan(root)
    const sub = files.find((f) => f.sessionId === 'abc123::agent-xyz')!
    expect(await adapter.peekSessionHeader(sub)).toEqual({
      id: 'abc123::agent-xyz',
      createdAt: Date.parse('2026-07-01T03:00:00.000Z'),
      cwd: 'D:\\proj\\sub',
      origin: 'subagent',
    })
  })

  it('纯元数据文件（无时间戳行）返回 null', async () => {
    const empty = path.join(root, 'projects', 'D--proj', 'meta-only.jsonl')
    await fs.writeFile(empty, '{"type":"permission-mode"}\n', 'utf8')
    const header = await adapter.peekSessionHeader({
      filePath: empty,
      sessionId: 'meta-only',
      workspaceDir: 'D--proj',
    })
    expect(header).toBeNull()
  })
})

describe('统计聚合集成（Claude Code 事件流）', () => {
  it('默认排除子代理：四大核心数字与 token 口径正确', async () => {
    const events = await parseAll()
    const report = aggregate(events)
    expect(report.overview.totalSessions).toBe(1)
    expect(report.overview.totalTurns).toBe(1)
    expect(report.overview.totalToolCalls).toBe(2)
    expect(report.overview.totalUserMessages).toBe(1)
    // token：160 + 200 + 300 = 660 入 / 73 + 5 + 5 = 83 出
    expect(report.overview.tokens).toEqual({ input: 660, output: 83 })
    // 大小写不敏感的工具分类
    const read = report.toolUsage.find((t) => t.name === 'Read')
    expect(read?.category).toBe('📖 文件操作')
    expect(report.fileOps.filesRead).toBe(1)
  })

  it('--include-subagents 并入子代理工具调用与 token，但不计会话数', async () => {
    const events = await parseAll()
    const report = aggregate(events, { includeSubagents: true })
    expect(report.overview.totalSessions).toBe(1)
    expect(report.overview.totalToolCalls).toBe(3)
    expect(report.overview.tokens).toEqual({ input: 670, output: 85 })
  })
})
