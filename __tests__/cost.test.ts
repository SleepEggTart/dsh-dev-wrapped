/**
 * 成本估算单测：单价计算、金额展示、口径红线（tokens 缺失由调用方跳过）
 */
import { describe, expect, it } from 'vitest'
import { DEEPSEEK_PRICING, estimateCost, fmtCost } from '../src/cost.js'

describe('estimateCost', () => {
  it('按公开单价计算：100 万 input + 100 万 output = ¥10', () => {
    const result = estimateCost({ input: 1_000_000, output: 1_000_000 })
    expect(result.model).toBe('deepseek-chat')
    expect(result.currency).toBe('CNY')
    expect(result.inputCost).toBeCloseTo(2, 10)
    expect(result.outputCost).toBeCloseTo(8, 10)
    expect(result.total).toBeCloseTo(10, 10)
    expect(result.inputTokens).toBe(1_000_000)
    expect(result.outputTokens).toBe(1_000_000)
  })

  it('真实数据量级：1.46 亿 input / 502 万 output', () => {
    const result = estimateCost({ input: 146_000_000, output: 5_020_000 })
    expect(result.inputCost).toBeCloseTo(292, 6)
    expect(result.outputCost).toBeCloseTo(40.16, 6)
    expect(result.total).toBeCloseTo(332.16, 6)
  })

  it('零 token 也返回结构化结果（调用方自行决定是否展示）', () => {
    const result = estimateCost({ input: 0, output: 0 })
    expect(result.total).toBe(0)
  })
})

describe('fmtCost', () => {
  it('小于 1000 保留两位小数', () => {
    expect(fmtCost(332.156)).toBe('¥332.16')
    expect(fmtCost(0)).toBe('¥0.00')
  })

  it('大于等于 1000 保留一位小数', () => {
    expect(fmtCost(1234.56)).toBe('¥1234.6')
  })
})

describe('DEEPSEEK_PRICING 常量', () => {
  it('单价为正数（防误改为 0 导致估算失真）', () => {
    expect(DEEPSEEK_PRICING.input).toBeGreaterThan(0)
    expect(DEEPSEEK_PRICING.output).toBeGreaterThan(0)
  })
})
