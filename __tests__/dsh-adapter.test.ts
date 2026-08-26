/**
 * DSH 适配器映射单测：session 头、tool/call、tool/result、
 * user/message 注入过滤、assistant/message usage 映射
 */
import { describe, expect, it } from 'vitest'
import { mapDshLine, toolCategory } from '../src/adapters/dsh.js'
import type { NormalizedEvent } from '../src/types.js'

/** 便捷包装：单行映射为事件数组（固定 sessionId，session 头可更新） */
function map(rec: Record<string, unknown>): NormalizedEvent[] {
  const events: NormalizedEvent[] = []
  let currentId = 'sess-1'
  mapDshLine(
    rec,
    () => currentId,
    (id) => (currentId = id),
    (e) => events.push(e),
  )
  return events
}

describe('session 头映射', () => {
  it('主会话：origin 缺省且 delegationDepth 为 0', () => {
    const events = map({
      type: 'session',
      id: 'session-abc',
      createdAt: 1780000000000,
      cwd: 'D:\\proj',
      delegationDepth: 0,
    })
    expect(events).toEqual([
      {
        kind: 'session-start',
        sessionId: 'session-abc',
        createdAt: 1780000000000,
        cwd: 'D:\\proj',
        origin: 'main',
      },
    ])
  })

  it('子代理判定：origin 字段优先', () => {
    const events = map({
      type: 'session',
      id: 'session-sub',
      createdAt: 1,
      cwd: 'D:\\proj',
      origin: 'subagent',
      delegationDepth: 0,
    })
    expect(events[0]).toMatchObject({ kind: 'session-start', origin: 'subagent' })
  })

  it('子代理判定：delegationDepth >= 1 兜底', () => {
    const events = map({
      type: 'session',
      id: 'session-sub2',
      createdAt: 1,
      cwd: 'D:\\proj',
      delegationDepth: 2,
    })
    expect(events[0]).toMatchObject({ origin: 'subagent' })
  })

  it('agentPreset 存在时透传', () => {
    const events = map({
      type: 'session',
      id: 's',
      createdAt: 1,
      cwd: 'D:\\p',
      agentPreset: 'researcher',
    })
    expect(events[0]).toMatchObject({ agentPreset: 'researcher' })
  })

  it('缺少 id 或 cwd 时丢弃', () => {
    expect(map({ type: 'session', id: '', createdAt: 1, cwd: 'D:\\p' })).toHaveLength(0)
    expect(map({ type: 'session', id: 's', createdAt: 1, cwd: '' })).toHaveLength(0)
  })
})

describe('turn / user-message 映射', () => {
  it('turn-start', () => {
    const events = map({ type: 'turn/start', seq: 1, time: 100, data: { turn: 3 } })
    expect(events).toEqual([{ kind: 'turn-start', sessionId: 'sess-1', turn: 3, time: 100 }])
  })

  it('普通用户消息：多段 text 拼接，isInjected=false', () => {
    const events = map({
      type: 'user/message',
      time: 100,
      data: { content: [{ type: 'text', text: '你好' }, { type: 'text', text: '第二段' }] },
    })
    expect(events).toEqual([
      { kind: 'user-message', sessionId: 'sess-1', time: 100, text: '你好\n第二段', isInjected: false },
    ])
  })

  it('<system-reminder> 开头的消息标记为注入', () => {
    const events = map({
      type: 'user/message',
      time: 100,
      data: { content: [{ type: 'text', text: '<system-reminder>some injected</system-reminder>' }] },
    })
    expect(events[0]).toMatchObject({ isInjected: true })
  })

  it('注入前有空白也识别（trimStart）', () => {
    const events = map({
      type: 'user/message',
      time: 1,
      data: { content: [{ type: 'text', text: '   <system-reminder>x' }] },
    })
    expect(events[0]).toMatchObject({ isInjected: true })
  })

  it('非 text 条目不计入', () => {
    const events = map({
      type: 'user/message',
      time: 1,
      data: { content: [{ type: 'image', url: 'x' }] },
    })
    expect(events[0]).toMatchObject({ text: '', isInjected: false })
  })
})

describe('assistant-message 映射', () => {
  const base = {
    type: 'assistant/message',
    time: 200,
    data: {
      message: {
        content: [
          { type: 'text', text: '回答内容' },
          { type: 'reasoning', text: '思考' },
        ],
        source: { model: 'deepseek-chat' },
      },
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, reasoningTokens: 5 },
    },
  }

  it('usage camelCase 映射为 {input, output}；textLength 只统计 text 条目', () => {
    const events = map(base)
    expect(events).toEqual([
      {
        kind: 'assistant-message',
        sessionId: 'sess-1',
        time: 200,
        model: 'deepseek-chat',
        textLength: '回答内容'.length,
        usage: { input: 100, output: 50 },
      },
    ])
  })

  it('缺失 usage 时事件不带 usage 字段', () => {
    const events = map({
      type: 'assistant/message',
      time: 1,
      data: { message: { content: [], source: {} } },
    })
    expect(events[0]).not.toHaveProperty('usage')
  })
})

describe('tool-call / tool-result 映射', () => {
  it('tool-call：arguments 字符串二次解析为对象', () => {
    const events = map({
      type: 'tool/call',
      time: 300,
      data: {
        turn: 2,
        step: 5,
        callId: 'call-1',
        name: 'read',
        arguments: JSON.stringify({ file_path: 'D:\\a.ts' }),
      },
    })
    expect(events).toEqual([
      {
        kind: 'tool-call',
        sessionId: 'sess-1',
        turn: 2,
        step: 5,
        callId: 'call-1',
        name: 'read',
        args: { file_path: 'D:\\a.ts' },
        time: 300,
      },
    ])
  })

  it('tool-call：arguments 非法 JSON 记为空对象', () => {
    const events = map({
      type: 'tool/call',
      time: 1,
      data: { turn: 1, step: 1, callId: 'c', name: 'bash', arguments: '{broken' },
    })
    expect(events[0]).toMatchObject({ args: {} })
  })

  it('tool-result：isError 在 content[0].isError（实测修正路径）', () => {
    const events = map({
      type: 'tool/result',
      time: 400,
      data: {
        message: {
          source: { callId: 'call-1' },
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              content: [{ type: 'text', text: 'Error: boom' }],
              isError: true,
            },
          ],
        },
      },
    })
    expect(events).toEqual([
      { kind: 'tool-result', sessionId: 'sess-1', callId: 'call-1', isError: true, time: 400 },
    ])
  })

  it('tool-result：正常结果 isError=false', () => {
    const events = map({
      type: 'tool/result',
      time: 1,
      data: {
        message: {
          source: { callId: 'c2' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }], isError: false }],
        },
      },
    })
    expect(events[0]).toMatchObject({ isError: false })
  })

  it('tool-result：content 为空时 isError=false', () => {
    const events = map({
      type: 'tool/result',
      time: 1,
      data: { message: { source: { callId: 'c3' }, content: [] } },
    })
    expect(events[0]).toMatchObject({ isError: false, callId: 'c3' })
  })
})

describe('类型忽略与工具分类', () => {
  it('已知忽略类型与未知类型均不产生事件', () => {
    expect(map({ type: 'reasoning-chunks', time: 1, data: {} })).toHaveLength(0)
    expect(map({ type: 'session/end-seed', time: 1, data: {} })).toHaveLength(0)
    expect(map({ type: 'some-future-type', time: 1, data: {} })).toHaveLength(0)
    expect(map({ type: 'turn/end', time: 1, data: {} })).toHaveLength(0)
  })

  it('toolCategory 已知映射与未知归类', () => {
    expect(toolCategory('read')).toBe('📖 文件操作')
    expect(toolCategory('str_replace_editor')).toBe('✏️ 代码产出')
    expect(toolCategory('unknown-tool')).toBe('📦 其他')
  })
})
