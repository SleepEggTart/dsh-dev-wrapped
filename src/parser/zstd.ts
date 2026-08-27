/**
 * zstd 流式解压
 *
 * 优先 spawn zstd CLI，stdout 用 readline 逐行流式消费（禁止全量读入内存）；
 * CLI 不可用或未产出数据即失败时，回退 fzstd 一次性解压（明文最大十几 MB，可接受）。
 * 两者均不可用时抛出 ZstdUnavailableError，由 CLI 层提示安装并以非 0 退出。
 */
import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as readline from 'node:readline'

/** zstd CLI 与 fzstd 均不可用 */
export class ZstdUnavailableError extends Error {
  constructor() {
    super('未找到 zstd 命令行工具，且可选依赖 fzstd 未安装')
    this.name = 'ZstdUnavailableError'
  }

  /** 根据当前平台生成对应的安装指引 */
  installHint(): string {
    const platform = process.platform
    const lines: string[] = ['  任选其一即可：']
    if (platform === 'win32') {
      lines.push('    winget install facebook.zstd          # 推荐')
      lines.push('    npm i -g fzstd                        # 或安装 Node.js 解压库')
    } else if (platform === 'darwin') {
      lines.push('    brew install zstd                     # 推荐')
      lines.push('    npm i -g fzstd                        # 或安装 Node.js 解压库')
    } else {
      lines.push('    sudo apt install zstd                 # Debian/Ubuntu')
      lines.push('    sudo yum install zstd                 # RHEL/CentOS')
      lines.push('    brew install zstd                     # macOS (Homebrew)')
      lines.push('    npm i -g fzstd                        # 或安装 Node.js 解压库')
    }
    lines.push('')
    lines.push('  详情见 README: https://github.com/SleepEggTart/dsh-dev-wrapped#readme')
    return lines.join('\n')
  }
}

/** 解压结果 */
export interface DecompressResult {
  /** 是否成功 */
  ok: boolean
  /** 实际使用的解压方式 */
  method: 'cli' | 'fzstd'
  /** 失败原因（ok=false 时） */
  error?: string
}

/**
 * 流式解压 zstd 压缩的 JSONL 文件，逐行回调 onLine。
 *
 * 回退策略：
 * - CLI 不存在（ENOENT）→ fzstd
 * - CLI 退出非 0 且已输出部分行 → 判定文件损坏（如截断），直接失败，
 *   不再回退以免同文件行被重复输出
 * - CLI 退出非 0 且未输出任何行 → 尝试 fzstd（少数 CLI 环境问题场景）
 */
export async function streamZstdLines(
  filePath: string,
  onLine: (line: string) => void,
  onWarn?: (msg: string) => void,
): Promise<DecompressResult> {
  const cliResult = await tryStreamViaCli(filePath, onLine, onWarn)
  if (cliResult !== null) return cliResult
  return streamViaFzstd(filePath, onLine)
}

/**
 * CLI 路径：spawn zstd 流式解压。
 * 返回 null 表示 zstd CLI 不可用，需要回退 fzstd。
 */
async function tryStreamViaCli(
  filePath: string,
  onLine: (line: string) => void,
  onWarn?: (msg: string) => void,
): Promise<DecompressResult | null> {
  return new Promise((resolve) => {
    // Windows 兼容：参数走数组传递，避免 shell 拼接的路径与转义问题
    const child = spawn('zstd', ['-d', '-c', filePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let spawnError: NodeJS.ErrnoException | null = null
    let stderrText = ''
    let lineCount = 0

    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnError = err
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrText += chunk
    })

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    rl.on('line', (line: string) => {
      lineCount++
      onLine(line)
    })

    child.on('close', (code) => {
      if (spawnError !== null) {
        if (spawnError.code === 'ENOENT') {
          // zstd CLI 未安装 → 回退 fzstd
          resolve(null)
        } else {
          resolve({ ok: false, method: 'cli', error: spawnError.message })
        }
        return
      }
      if (code === 0) {
        resolve({ ok: true, method: 'cli' })
        return
      }
      if (lineCount > 0) {
        // 已输出部分行后失败 → 疑似文件损坏（截断等），直接判定失败
        onWarn?.(`zstd CLI 解压中断（退出码 ${code}），疑似文件损坏`)
        resolve({ ok: false, method: 'cli', error: `zstd 退出码 ${code}: ${stderrText.trim()}` })
        return
      }
      // 未输出任何行即失败 → 尝试 fzstd 回退
      resolve(null)
    })
  })
}

/** fzstd 回退路径：一次性解压后逐行回调 */
async function streamViaFzstd(
  filePath: string,
  onLine: (line: string) => void,
): Promise<DecompressResult> {
  // fzstd 是 optionalDependencies：用非字面量模块名动态导入，
  // 未安装时不影响编译与运行（走到这里才报错）
  let mod: { decompress: (data: Uint8Array) => Uint8Array }
  try {
    const spec = 'fzstd' as string
    mod = (await import(spec)) as { decompress: (data: Uint8Array) => Uint8Array }
  } catch {
    throw new ZstdUnavailableError()
  }
  const compressed = await fs.readFile(filePath)
  // fzstd 对损坏数据会抛错，由上层捕获后警告并跳过该会话
  const decompressed = mod.decompress(new Uint8Array(compressed))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(decompressed)
  for (const line of text.split('\n')) {
    if (line.trim().length > 0) onLine(line)
  }
  return { ok: true, method: 'fzstd' }
}

/**
 * 只解压读取首行（会话头窥探用）。
 * CLI 路径读到首行即杀掉 zstd 进程，避免解压整个文件。
 * 返回 null 表示无法读取（文件损坏 / 空文件 / 解压工具缺失）。
 */
export async function readFirstZstdLine(filePath: string): Promise<string | null> {
  const viaCli = await readFirstLineViaCli(filePath)
  if (viaCli !== undefined) return viaCli
  return readFirstLineViaFzstd(filePath)
}

/** CLI 首行读取；返回 undefined 表示 zstd CLI 不可用（需回退），null 表示读取失败或空文件 */
async function readFirstLineViaCli(filePath: string): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    const child = spawn('zstd', ['-d', '-c', filePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    const finish = (v: string | null | undefined) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    child.on('error', (err: NodeJS.ErrnoException) => {
      // ENOENT：CLI 未安装，交由调用方回退 fzstd
      finish(err.code === 'ENOENT' ? undefined : null)
    })
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    rl.on('line', (line: string) => {
      rl.close()
      child.stdout.destroy()
      child.kill()
      finish(line.trim().length > 0 ? line : null)
    })
    child.on('close', () => {
      // 进程结束仍未取得首行：空文件或解压失败
      finish(null)
    })
  })
}

/** fzstd 首行读取（CLI 不可用时的回退） */
async function readFirstLineViaFzstd(filePath: string): Promise<string | null> {
  try {
    const spec = 'fzstd' as string
    const mod = (await import(spec)) as { decompress: (data: Uint8Array) => Uint8Array }
    const compressed = await fs.readFile(filePath)
    const text = new TextDecoder('utf-8', { fatal: false }).decode(
      mod.decompress(new Uint8Array(compressed)),
    )
    for (const line of text.split('\n')) {
      if (line.trim().length > 0) return line
    }
    return null
  } catch {
    return null
  }
}
