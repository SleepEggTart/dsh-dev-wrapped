/**
 * fuzz 容错测试：损坏 zstd / 截断文件 / 空文件 / 随机垃圾 JSONL 行
 *
 * 核心断言不是"解压成功"，而是"任何损坏输入都不会导致进程崩溃或未捕获异常"：
 * - streamZstdLines：要么返回 ok:false，要么抛出可捕获的 Error（上层警告并跳过会话）
 * - readFirstZstdLine：损坏 / 空文件一律返回 null
 * - parseJsonlLine / mapDshLine：任意垃圾行安全忽略，绝不抛错
 *
 * 随机数据使用固定种子 PRNG，保证 CI 可复现。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { streamZstdLines, readFirstZstdLine } from '../src/parser/zstd.js'
import { parseJsonlLine } from '../src/parser/jsonl.js'
import { mapDshLine } from '../src/adapters/dsh.js'

/** 固定种子 PRNG（mulberry32），保证 fuzz 用例可复现 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 随机字节缓冲区（模拟损坏的 zstd 文件） */
function randomBytes(rand: () => number, size: number): Buffer {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = Math.floor(rand() * 256)
  return buf
}

/** 临时目录 */
let tmpDir: string

/** zstd CLI 是否可用（截断用例需要真实压缩） */
let zstdAvailable = false

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-fuzz-'))
  zstdAvailable = await new Promise<boolean>((resolve) => {
    const child = spawn('zstd', ['--version'])
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

/** 写入临时文件并返回绝对路径 */
async function writeTmp(name: string, data: Buffer | string): Promise<string> {
  const p = path.join(tmpDir, name)
  await fs.writeFile(p, data)
  return p
}

/**
 * 调用 streamZstdLines 并要求"不崩溃"：
 * 允许 ok:false、ok:true 或抛出 Error，返回收集到的行数。
 */
async function runStream(filePath: string): Promise<string[]> {
  const lines: string[] = []
  let thrown: unknown = null
  try {
    await streamZstdLines(filePath, (l) => lines.push(l))
  } catch (err) {
    thrown = err
  }
  if (thrown !== null) {
    // 抛错必须是 Error 实例（上层用 message 提示，不会崩）
    expect(thrown).toBeInstanceOf(Error)
  }
  return lines
}

/**
 * 调用 streamZstdLines 并要求"优雅失败"：
 * 允许 ok:false 或抛出 Error，但绝不崩溃、绝不 ok:true。
 * 返回收集到的行数。
 */
async function expectGracefulFailure(filePath: string): Promise<number> {
  const lines: string[] = []
  const warnings: string[] = []
  let result: Awaited<ReturnType<typeof streamZstdLines>> | null = null
  let thrown: unknown = null
  try {
    result = await streamZstdLines(
      filePath,
      (l) => lines.push(l),
      (m) => warnings.push(m),
    )
  } catch (err) {
    thrown = err
  }
  // 抛错必须是 Error 实例（上层用 message 提示，不会崩）
  if (thrown !== null) {
    expect(thrown).toBeInstanceOf(Error)
    return lines.length
  }
  // 未抛错时必须显式报告失败
  expect(result).not.toBeNull()
  expect(result!.ok).toBe(false)
  return lines.length
}

/* ==================== 损坏 zstd 文件 ==================== */

describe('fuzz：损坏 zstd（随机字节）', () => {
  it('多个随机字节文件均优雅失败', async () => {
    const rand = mulberry32(42)
    for (let i = 0; i < 5; i++) {
      // 覆盖不同尺寸：小文件 / 带伪 zstd 魔数 / 较大文件
      let buf = randomBytes(rand, 16 + Math.floor(rand() * 4096))
      if (i === 1) {
        // 魔数正确但后续为垃圾：最容易骗过解压器的场景
        buf = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), randomBytes(rand, 512)])
      }
      const p = await writeTmp(`corrupt-${i}.zst`, buf)
      await expectGracefulFailure(p)
    }
  })

  it('readFirstZstdLine 对损坏文件返回 null', async () => {
    const rand = mulberry32(43)
    const p = await writeTmp('corrupt-head.zst', randomBytes(rand, 256))
    await expect(readFirstZstdLine(p)).resolves.toBeNull()
  })
})

/* ==================== 空文件 ==================== */

describe('fuzz：空文件', () => {
  it('0 字节文件不崩溃（空会话语义：ok 或显式失败均可，且零行输出）', async () => {
    const p = await writeTmp('empty.zst', Buffer.alloc(0))
    // zstd CLI 对空文件可能退出码 0（视为空会话），也可能报错（显式失败）；
    // 两者均安全：关键是零行输出、无未捕获异常
    const lines = await runStream(p)
    expect(lines).toHaveLength(0)
  })

  it('readFirstZstdLine 对空文件返回 null', async () => {
    const p = await writeTmp('empty-head.zst', Buffer.alloc(0))
    await expect(readFirstZstdLine(p)).resolves.toBeNull()
  })

  it('解压后只有空行的文件：首行读取返回 null', async () => {
    // 纯空白内容压缩后解压不出任何非空行（需 zstd CLI；不可用则跳过）
    if (!zstdAvailable) return
    const p = await compressWithCli('   \n\n  \n')
    expect(p).not.toBeNull()
    await expect(readFirstZstdLine(p!)).resolves.toBeNull()
  })
})

/* ==================== 截断的有效 zstd ==================== */

describe('fuzz：截断的有效 zstd', () => {
  it('压缩数据截断一半后优雅失败', async () => {
    if (!zstdAvailable) return // 无 zstd CLI 时跳过（fzstd 仅解压无法生成样本）
    const jsonl = Array.from(
      { length: 500 },
      (_, i) => JSON.stringify({ type: 'user/message', time: i, data: { content: [] } }),
    ).join('\n')
    const full = await compressWithCli(jsonl)
    expect(full).not.toBeNull()
    const compressed = await fs.readFile(full!)
    // 各截断比例：只保留前 10% / 30% / 60%（至少保留 4 字节魔数）
    for (const ratio of [0.1, 0.3, 0.6]) {
      const cut = Math.max(4, Math.floor(compressed.length * ratio))
      const p = await writeTmp(`trunc-${ratio}.zst`, compressed.subarray(0, cut))
      await expectGracefulFailure(p)
    }
  })

  it('readFirstZstdLine 对严重截断（仅魔数+少量字节）文件返回 null 或不崩溃', async () => {
    if (!zstdAvailable) return
    const jsonl = JSON.stringify({ type: 'session', id: 's', createdAt: 1, cwd: '/x' })
    const full = await compressWithCli(jsonl)
    expect(full).not.toBeNull()
    const compressed = await fs.readFile(full!)
    const p = await writeTmp('trunc-head.zst', compressed.subarray(0, 6))
    const r = await readFirstZstdLine(p)
    // 允许 null（读取失败）；若读到首行则必须是非空字符串
    if (r !== null) expect(typeof r).toBe('string')
  })
})

/* ==================== 随机垃圾 JSONL 行 ==================== */

describe('fuzz：随机垃圾 JSONL 行', () => {
  it('parseJsonlLine 对任意字符串不抛错', () => {
    const rand = mulberry32(100)
    const garbage: Array<() => string> = [
      () => randomBytes(rand, 64).toString('utf8'), // 二进制垃圾
      () => '{"type":', // 截断 JSON
      () => '{'.repeat(Math.floor(rand() * 200)), // 深嵌套未闭合
      () => '[' + '"x",'.repeat(1000) + '}', // 结构错乱
      () => JSON.stringify({ a: null }).slice(0, 5), // 半截
      () => '\u0000\u0001\u0002',
      () => 'x'.repeat(100_000), // 超长行
      () => String(rand()), // 数字字面量
    ]
    for (const gen of garbage) {
      for (let i = 0; i < 20; i++) {
        const line = gen()
        // 唯一要求：不抛错；结果是任意合法 JSON 值或 undefined 均可
        // （数字 / 字符串字面量同样是合法 JSON 行，由上层 isRecord 过滤）
        parseJsonlLine(line)
      }
    }
  })

  it('mapDshLine 对随机结构对象不抛错', () => {
    const rand = mulberry32(200)
    /** 随机生成未知值（含错误类型字段） */
    const randomValue = (depth: number): unknown => {
      const pick = Math.floor(rand() * 8)
      switch (pick) {
        case 0: return null
        case 1: return rand() * 1e9
        case 2: return Math.floor(rand() * 1e12)
        case 3: return rand() < 0.5 ? '' : 'x'.repeat(Math.floor(rand() * 50))
        case 4: return rand() < 0.5
        case 5: return [] // 空数组（代替 undefined，JSON 无 undefined）
        case 6:
          return depth < 3
            ? Array.from({ length: Math.floor(rand() * 4) }, () => randomValue(depth + 1))
            : 0
        default:
          if (depth < 3) {
            const obj: Record<string, unknown> = {}
            const keys = ['type', 'id', 'cwd', 'time', 'data', 'origin', 'delegationDepth',
              'agentPreset', 'content', 'message', 'usage', 'callId', 'name', 'arguments',
              'turn', 'step', 'createdAt']
            for (const k of keys) if (rand() < 0.4) obj[k] = randomValue(depth + 1)
            return obj
          }
          return 'leaf'
      }
    }
    // 已知事件类型 + 随机未知类型混合轰炸
    const types = ['session', 'turn/start', 'user/message', 'assistant/message',
      'tool/call', 'tool/result', 'totally-unknown-type', '']
    let eventCount = 0
    for (let i = 0; i < 500; i++) {
      const rec: Record<string, unknown> = { type: types[Math.floor(rand() * types.length)] }
      for (const k of ['id', 'cwd', 'createdAt', 'time', 'data', 'origin', 'delegationDepth']) {
        if (rand() < 0.6) rec[k] = randomValue(0)
      }
      mapDshLine(
        rec,
        () => 'fuzz-session',
        () => {},
        () => eventCount++,
      )
    }
    // 唯一硬性要求：全程无异常（eventCount 数值仅确保回调可执行）
    expect(eventCount).toBeGreaterThanOrEqual(0)
  })

  it('构造字段全错的半合法记录不抛错', () => {
    // type 合法但字段类型全部错误：最易触发隐藏类型假设的场景
    const badRecords: Array<Record<string, unknown>> = [
      { type: 'session', id: 123, cwd: null, createdAt: 'not-a-number' },
      { type: 'session', id: 'ok', cwd: 'ok', createdAt: NaN, delegationDepth: 'deep' },
      { type: 'tool/call', data: { arguments: Buffer.from('binary'), callId: {}, name: [] } },
      { type: 'tool/result', data: { message: { content: 'not-array', source: 42 } } },
      { type: 'user/message', data: { content: { not: 'array' } } },
      { type: 'assistant/message', data: { message: null, usage: { inputTokens: 'x' } } },
      { type: 'turn/start', data: null },
    ]
    for (const rec of badRecords) {
      expect(() =>
        mapDshLine(rec, () => 's', () => {}, () => {}),
      ).not.toThrow()
    }
  })
})

/* ==================== 工具函数 ==================== */

/** 用 zstd CLI 压缩字符串，返回压缩文件路径；CLI 失败返回 null */
async function compressWithCli(content: string): Promise<string | null> {
  const src = path.join(tmpDir, `src-${Math.random().toString(36).slice(2)}.jsonl`)
  const out = src + '.zst'
  await fs.writeFile(src, content, 'utf8')
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn('zstd', ['-f', '-q', src, '-o', out])
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  return ok ? out : null
}
