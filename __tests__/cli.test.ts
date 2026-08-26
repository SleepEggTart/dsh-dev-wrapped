/**
 * CLI 参数解析单测：parseArgs 布尔/带值选项、未知选项报错、
 * parseDateArg 合法日期与非法格式
 */
import { describe, expect, it } from 'vitest'
import { parseArgs, parseDateArg } from '../src/cli.js'

/* ==================== parseArgs ==================== */

describe('parseArgs 布尔开关', () => {
  it('--json 正确解析', () => {
    expect(parseArgs(['--json'])).toEqual({ json: true })
  })

  it('--include-subagents 正确解析', () => {
    expect(parseArgs(['--include-subagents'])).toEqual({ includeSubagents: true })
  })

  it('--help 正确解析', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })

  it('-h 正确解析', () => {
    expect(parseArgs(['-h'])).toEqual({ help: true })
  })

  it('多个布尔开关组合', () => {
    const result = parseArgs(['--json', '--include-subagents', '--help'])
    expect(result).toEqual({ json: true, includeSubagents: true, help: true })
  })
})

describe('parseArgs 带值选项', () => {
  it('--dsh-home 正确取后一个值', () => {
    const result = parseArgs(['--dsh-home', '/custom/path'])
    expect(result.dshHome).toBe('/custom/path')
  })

  it('--output 正确取后一个值', () => {
    const result = parseArgs(['--output', './out'])
    expect(result.output).toBe('./out')
  })

  it('--since 正确取后一个值', () => {
    const result = parseArgs(['--since', '2026-01-01'])
    expect(result.since).toBe('2026-01-01')
  })

  it('--until 正确取后一个值', () => {
    const result = parseArgs(['--until', '2026-12-31'])
    expect(result.until).toBe('2026-12-31')
  })

  it('带值选项与布尔选项混合', () => {
    const result = parseArgs(['--dsh-home', '/data', '--json', '--since', '2026-06-01'])
    expect(result).toEqual({ dshHome: '/data', json: true, since: '2026-06-01' })
  })
})

describe('parseArgs 异常情况', () => {
  it('未知选项抛错', () => {
    expect(() => parseArgs(['--foo'])).toThrow('未知选项: --foo')
  })

  it('带值选项缺值（末尾无参数）抛错', () => {
    expect(() => parseArgs(['--output'])).toThrow('选项 --output 缺少参数值')
  })

  it('带值选项缺值（后跟另一个选项）抛错', () => {
    expect(() => parseArgs(['--output', '--json'])).toThrow('选项 --output 缺少参数值')
  })

  it('空数组返回空对象', () => {
    expect(parseArgs([])).toEqual({})
  })
})

/* ==================== parseDateArg ==================== */

describe('parseDateArg 合法日期', () => {
  it('startOfDay=true 返回该日本地 00:00:00.000', () => {
    const ts = parseDateArg('2026-08-26', 'test', true)
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // 8 月 → 0-based 7
    expect(d.getDate()).toBe(26)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  it('startOfDay=false 返回该日本地 23:59:59.999', () => {
    const ts = parseDateArg('2026-08-26', 'test', false)
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(26)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
    expect(d.getSeconds()).toBe(59)
    expect(d.getMilliseconds()).toBe(999)
  })
})

describe('parseDateArg 非法格式', () => {
  it('斜杠分隔抛错', () => {
    expect(() => parseDateArg('2026/08/26', '--since', true)).toThrow('无效的 --since 日期')
  })

  it('月份越界抛错', () => {
    expect(() => parseDateArg('2026-13-01', '--until', true)).toThrow('无效的 --until 日期')
  })

  it('纯文本抛错', () => {
    expect(() => parseDateArg('abc', '--since', true)).toThrow('无效的 --since 日期')
  })
})
