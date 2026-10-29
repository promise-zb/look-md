#!/usr/bin/env node
/**
 * 按当前系统打安装包。不能交叉编译：Mac 出 dmg，Windows 出 NSIS exe。
 *
 *   pnpm pack        按本机系统自动选
 *   pnpm pack:mac    仅 macOS
 *   pnpm pack:win    仅 Windows（需要 VS C++ 生成工具）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, statSync } from 'node:fs'
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

/** 把本次安装包复制到仓库根的 releases/<版本>/。该目录已 gitignore，Tauri 也不会把它打进应用。 */
function archiveRelease() {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const dest = join(root, 'releases', version)
  mkdirSync(dest, { recursive: true })

  const bases = [join(root, 'src-tauri', 'target')]
  if (process.env.CARGO_TARGET_DIR) bases.push(process.env.CARGO_TARGET_DIR)

  const bundleDirs = []
  for (const base of bases) {
    if (!existsSync(base)) continue
    const direct = join(base, 'release', 'bundle')
    if (existsSync(direct)) bundleDirs.push(direct)
    for (const name of readdirSync(base)) {
      const nested = join(base, name, 'release', 'bundle')
      if (existsSync(nested)) bundleDirs.push(nested)
    }
  }

  const copied = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!name.includes(version)) continue
      if (!/\.(dmg|pkg|exe|msi)$/i.test(name)) continue
      const target = join(dest, name)
      copyFileSync(full, target)
      copied.push(target)
    }
  }
  for (const dir of bundleDirs) walk(dir)

  if (copied.length === 0) {
    console.error(`没有找到版本 ${version} 的安装包，未写入 ${dest}`)
    process.exit(1)
  }
  console.log(`本地安装包（不提交）：`)
  for (const file of copied) console.log(`  ${file}`)
}

function pack(bundles) {
  run(pnpm, ['exec', 'tauri', 'build', '--bundles', bundles])
  // Mac 再打一个 .pkg。双击它会升级已安装的 LookMD，而不是另装一份。
  if (os === 'darwin' && bundles === 'dmg') run('bash', ['scripts/macos-pkg.sh'])
  archiveRelease()
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
