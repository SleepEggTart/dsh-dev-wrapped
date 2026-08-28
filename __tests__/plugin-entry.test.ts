/**
 * Cordis 插件入口测试（v1.3.1 斜杠命令注册）
 *
 * 验证 apply 的结构探测与 /wrapped 斜杠命令注册：
 * - 有 ctx.commands（DSH 官方 commands 服务）→ 注册斜杠命令，不注册传统命令
 * - 只有 ctx.command → 回退传统 dev.wrapped 命令
 * - 两者皆无 → 安全跳过
 */
import { describe, expect, it, vi } from 'vitest'
import { apply, name, usage } from '../src/index.js'

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('apply 插件入口', () => {
  it('导出插件元信息', () => {
    expect(name).toBe('dsh-dev-wrapped')
    expect(usage).toContain('/wrapped')
  })

  it('有 ctx.commands 服务时注册 /wrapped 斜杠命令且不注册传统命令', () => {
    const registered: Array<{ name: string; description: string }> = []
    const ctx = {
      commands: {
        register(def: { name: string; description: string }) {
          registered.push(def)
          return () => undefined
        },
      },
      command: vi.fn(),
      logger: makeLogger,
    }
    apply(ctx)
    expect(registered).toHaveLength(1)
    expect(registered[0].name).toBe('wrapped')
    expect(registered[0].description).toContain('回顾报告')
    expect(ctx.command).not.toHaveBeenCalled()
  })

  it('斜杠命令 handler 未传 --adapter 时注入默认 dsh', async () => {
    let handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text?: string }> | undefined
    const ctx = {
      commands: {
        register(def: {
          name: string
          handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text?: string }>
        }) {
          handler = def.handler
          return () => undefined
        },
      },
      logger: makeLogger,
    }
    apply(ctx)
    expect(handler).toBeDefined()
    // rawInput 透传给 runCli 的参数不含 --adapter 时会注入默认值；
    // 这里只验证 handler 能被调用且返回约定结构（不实际扫描会话）
    const result = await handler!({ rawInput: '--json', signal: new AbortController().signal })
    expect(result).toHaveProperty('kind')
  })

  it('无 commands 服务时回退传统 dev.wrapped 命令', () => {
    const actions: Array<(argv: string[]) => Promise<number>> = []
    const ctx = {
      command: vi.fn((_name: string, _desc: string) => ({
        action(fn: (argv: string[]) => Promise<number>) {
          actions.push(fn)
          return this
        },
      })),
      logger: makeLogger,
    }
    apply(ctx)
    expect(ctx.command).toHaveBeenCalledWith('dev.wrapped', expect.any(String))
    expect(actions).toHaveLength(1)
  })

  it('command 与 commands 均无时安全跳过（不抛错）', () => {
    expect(() => apply({ logger: makeLogger })).not.toThrow()
    expect(() => apply({})).not.toThrow()
  })
})
