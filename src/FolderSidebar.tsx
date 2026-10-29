import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

/** 与 Rust `DirEntryDto` 一致（serde camelCase）。 */
export type DirEntry = {
  name: string
  path: string
  isDir: boolean
}

/** Windows 路径不区分大小写；Mac 保持原样，避免大小写敏感磁盘上两个文件被当成同一个。 */
const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

/** 去掉末尾分隔符，反斜杠改成斜杠，方便 Mac / Windows 互相比较。 */
function normalize(path: string): string {
  let s = path.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  // `C:` 和 `C:\` 都是盘符根，统一成 `C:/`。
  if (/^[A-Za-z]:$/.test(s)) s += '/'
  return isWindows ? s.toLowerCase() : s
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

type Props = {
  workspaceRoot: string
  currentDir: string
  activePath: string | null
  onChangeDir: (dir: string) => void
  onOpenFile: (path: string) => void
}

export function FolderSidebar({
  workspaceRoot,
  currentDir,
  activePath,
  onChangeDir,
  onOpenFile,
}: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void invoke<DirEntry[]>('list_dir', { path: currentDir })
      .then((list) => {
        if (!cancelled) {
          setEntries(list)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [currentDir])

  const parent = parentPath(currentDir)
  // 不能高于用户选中的工作区，也不能超出盘符根 / Unix 根。
  const canUp = parent !== null && !samePath(currentDir, workspaceRoot)
  const folderName = currentDir.split(/[/\\]/).filter(Boolean).pop() ?? currentDir

  return (
    <aside className="sidebar">
      <div className="sidebar-nav">
        <button
          type="button"
          className="sidebar-up"
          disabled={!canUp}
          title="返回上一级"
          onClick={() => {
            if (parent) onChangeDir(parent)
          }}
        >
          ← 上一级
        </button>
        <span className="sidebar-folder" title={currentDir}>
          {folderName}
        </span>
      </div>
      {error ? <p className="sidebar-error">{error}</p> : null}
      <ul className="sidebar-list">
        {entries.length === 0 && !error ? <li className="sidebar-empty">空文件夹</li> : null}
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              className={
                samePath(entry.path, activePath ?? '') ? 'sidebar-item is-active' : 'sidebar-item'
              }
              onClick={() => {
                if (entry.isDir) onChangeDir(entry.path)
                else onOpenFile(entry.path)
              }}
            >
              <span className="sidebar-kind">{entry.isDir ? '文件夹' : 'MD'}</span>
              {entry.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
