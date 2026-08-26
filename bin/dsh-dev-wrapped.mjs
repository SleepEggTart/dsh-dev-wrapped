#!/usr/bin/env node
// CLI 入口：转发到 dist/cli.js 的 runCli
import { runCli } from '../dist/cli.js'

// 用 exitCode 而非 process.exit，保证 stdout 缓冲正常刷出
process.exitCode = await runCli(process.argv.slice(2))
