/**
 * 交互式数据源选择解析测试（v1.2.1）
 */
import { describe, expect, it } from 'vitest'
import { parseAdapterChoice } from '../src/cli.js'

describe('parseAdapterChoice 菜单输入解析', () => {
  it('数字序号 1/2/3 分别映射 dsh / claude-code / all', () => {
    expect(parseAdapterChoice('1')).toBe('dsh')
    expect(parseAdapterChoice('2')).toBe('claude-code')
    expect(parseAdapterChoice('3')).toBe('all')
  })

  it('名称 dsh / claude-code / all 同样接受', () => {
    expect(parseAdapterChoice('dsh')).toBe('dsh')
    expect(parseAdapterChoice('claude-code')).toBe('claude-code')
    expect(parseAdapterChoice('all')).toBe('all')
  })

  it('空输入与默认回车返回 null（走默认 dsh）', () => {
    expect(parseAdapterChoice('')).toBeNull()
    expect(parseAdapterChoice('   ')).toBeNull()
  })

  it('容忍首尾空白', () => {
    expect(parseAdapterChoice('  2  ')).toBe('claude-code')
    expect(parseAdapterChoice('\t3\n')).toBe('all')
  })

  it('非法输入返回 null', () => {
    expect(parseAdapterChoice('4')).toBeNull()
    expect(parseAdapterChoice('abc')).toBeNull()
    expect(parseAdapterChoice('--adapter')).toBeNull()
  })
})
