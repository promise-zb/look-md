import { convertFileSrc } from '@tauri-apps/api/core'

import { dirOfFile } from './FolderSidebar'

/** 已经是网页能直接请求的地址，不用再改。 */
const REMOTE = /^(https?:|data:|blob:|asset:|tauri:)/i

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)
}

/** 把相对路径接到笔记所在目录上。分隔符跟笔记路径一致，Mac 用 `/`，Windows 用 `\`。 */
function joinPath(dir: string, rel: string): string {
  const drive = dir.match(/^[A-Za-z]:/)?.[0]
  const root = dir.startsWith('/')
  const stack = dir.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean)
  for (const part of rel.split(/[/\\]/)) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length > (drive ? 1 : 0)) stack.pop()
      continue
    }
    stack.push(part)
  }
  if (drive) return stack.join('\\')
  if (root) return `/${stack.join('/')}`
  return stack.join(dir.includes('\\') ? '\\' : '/')
}

/**
 * 编辑器里 `<img>` 要用的地址。
 * Markdown 里仍是相对路径；这里只给界面换成 Tauri 能读的本地地址。
 * 没有打开文件时无法定位目录，原样返回。
 */
export function imageDomSrc(src: string, filePath: string | null): string {
  const raw = src.trim()
  if (!raw || REMOTE.test(raw) || raw.startsWith('//') || !filePath) return src

  let path = raw
  if (path.toLowerCase().startsWith('file:')) {
    try {
      const url = new URL(path)
      path = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    } catch {
      return src
    }
  } else {
    try {
      path = decodeURI(path)
    } catch {
      // 非法转义就按原字符串拼路径。
    }
  }

  const absolute = isAbsolutePath(path) ? path : joinPath(dirOfFile(filePath), path)
  try {
    return convertFileSrc(absolute)
  } catch {
    return src
  }
}
