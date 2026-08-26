/**
 * JSONL 解析单测：逐行解析 + arguments 二次解析
 */
import { describe, expect, it } from 'vitest'
import { parseJsonlLine, parseToolArguments } from '../src/parser/jsonl.js'

describe('parseJsonlLine', () => {
  it('正常解析 JSON 对象行', () => {
    expect(parseJsonlLine('{"type":"session","id":"s1"}')).toEqual({ type: 'session', id: 's1' })
  })

  it('解析数组行', () => {
    expect(parseJsonlLine('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('空行与纯空白行返回 undefined', () => {
    expect(parseJsonlLine('')).toBeUndefined()
    expect(parseJsonlLine('   \t ')).toBeUndefined()
  })

  it('非法 JSON 返回 undefined 并发出警告', () => {
    const warnings: string[] = []
    const r = parseJsonlLine('{broken json', (m) => warnings.push(m))
    expect(r).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('JSON 行解析失败')
  })

  it('无警告回调时不抛错', () => {
    expect(parseJsonlLine('not json')).toBeUndefined()
  })
})

describe('parseToolArguments（arguments 二次解析）', () => {
  it('JSON 字符串解析为对象（真实数据格式）', () => {
    const raw = JSON.stringify({ file_path: 'D:\\test\\a.ts', offset: 10 })
    expect(parseToolArguments(raw)).toEqual({ file_path: 'D:\\test\\a.ts', offset: 10 })
  })

  it('非法 JSON 字符串返回空对象', () => {
    expect(parseToolArguments('{broken')).toEqual({})
  })

  it('字符串字面量（非对象 JSON）返回空对象', () => {
    expect(parseToolArguments('"hello"')).toEqual({})
    expect(parseToolArguments('123')).toEqual({})
    expect(parseToolArguments('null')).toEqual({})
  })

  it('数组返回空对象', () => {
    expect(parseToolArguments('[1,2]')).toEqual({})
  })

  it('对象直接透传（防御未来格式演进）', () => {
    expect(parseToolArguments({ a: 1 })).toEqual({ a: 1 })
  })

  it('null / undefined / number 返回空对象', () => {
    expect(parseToolArguments(null)).toEqual({})
    expect(parseToolArguments(undefined)).toEqual({})
    expect(parseToolArguments(42)).toEqual({})
  })
})
