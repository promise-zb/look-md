#!/usr/bin/env node
/**
 * 按当前系统打安装包。不能交叉编译：Mac 出 dmg，Windows 出 NSIS exe。
 *
 *   pnpm pack        按本机系统自动选
 *   pnpm pack:mac    仅 macOS
 *   pnpm pack:win    仅 Windows（需要 VS C++ 生成工具）
 */
import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const os = platform()
const mode = process.argv[2] ?? 'auto'
// Windows 上 pnpm 是 pnpm.cmd，不走 shell，避免参数被 cmd 拆开。
const pnpm = os === 'win32' ? 'pnpm.cmd' : 'pnpm'

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status)
}

function pack(bundles) {
  run(pnpm, ['exec', 'tauri', 'build', '--bundles', bundles])
  // Mac 再打一个 .pkg。双击它会升级已安装的 LookMD，而不是另装一份。
  if (os === 'darwin' && bundles === 'dmg') run('bash', ['scripts/macos-pkg.sh'])
  process.exit(0)
}

if (mode === 'mac') {
  if (os !== 'darwin') {
    fail(
      'pack:mac 只能在 macOS 上执行。\nWindows 安装包请在 Windows 上跑 pnpm pack:win，或推送 tag v* 走 GitHub Actions。',
    )
  }
  pack('dmg')
}

if (mode === 'win') {
  if (os !== 'win32') {
    fail(
      'pack:win 只能在 Windows 上执行（还需要 VS Build Tools / C++）。\n本机请用 pnpm pack:mac；Windows 包用 .github/workflows/release.yml。',
    )
  }
  pack('nsis')
}

if (mode === 'auto') {
  if (os === 'darwin') pack('dmg')
  if (os === 'win32') pack('nsis')
  fail(`当前系统 ${os} 不支持本地打包。Mac / Windows 安装包请用 GitHub Actions。`)
}

fail(`未知参数 ${mode}。用法：pnpm pack | pnpm pack:mac | pnpm pack:win`)
