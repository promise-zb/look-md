/** Windows 路径不区分大小写；Mac 保持原样，避免大小写敏感磁盘上两个文件被当成同一个。 */
const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

/** 去掉末尾分隔符，反斜杠改成斜杠，方便 Mac / Windows 互相比较。 */
function normalize(path: string): string {
  let s = path.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  // `C:` 和 `C:\` 都是盘符根，统一成 `C:/`。
  if (/^[A-Za-z]:$/.test(s)) s += '/'
  return isWindows ? s.toLowerCase() : s
}

/** 同时认 `/` 和 `\`，Mac、Windows 都能取出文件名。 */
export function fileName(path: string | null): string {
  if (!path) return '未命名'
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export function samePath(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

/**
 * 上一级目录。
 * Unix 根目录 `/` 和 Windows 盘符根 `C:\` 没有父级，返回 null。
 * 盘符根必须带分隔符：`C:` 在 Windows 上表示该盘的当前目录，不是根目录。
 */
export function parentPath(path: string): string | null {
  const trimmed = path.replace(/[/\\]+$/, '')
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (i <= 0) return trimmed.startsWith('/') ? '/' : null

  const parent = trimmed.slice(0, i)
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`
  return parent || '/'
}

/** 文件所在目录。打开单文件时，用来定位侧栏。 */
export function dirOfFile(filePath: string): string {
  return parentPath(filePath) ?? filePath
}
