import { invoke } from '@tauri-apps/api/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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

function FolderIcon() {
  return (
    <svg className="sidebar-icon is-dir" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.6 4.1c0-.7.6-1.3 1.3-1.3h2.6l1.2 1.4H13c.7 0 1.3.6 1.3 1.3v6.9c0 .7-.6 1.3-1.3 1.3H2.9c-.7 0-1.3-.6-1.3-1.3V4.1z"
      />
    </svg>
  )
}

/** 一行放不下时，从中间删掉一段，留下开头和结尾。 */
function fitMiddle(el: HTMLElement, text: string): string {
  const chars = Array.from(text)
  el.textContent = text
  if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth) return text

  let lo = 0
  let hi = chars.length
  let best = '…'
  while (lo <= hi) {
    const keep = Math.floor((lo + hi) / 2)
    const candidate =
      keep >= chars.length
        ? text
        : `${chars.slice(0, Math.ceil(keep / 2)).join('')}…${chars.slice(chars.length - Math.floor(keep / 2)).join('')}`
    el.textContent = candidate
    if (el.scrollWidth <= el.clientWidth) {
      best = candidate
      lo = keep + 1
    } else {
      hi = keep - 1
    }
  }
  return best
}

function SidebarName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(name)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = () => {
      const next = fitMiddle(el, name)
      el.textContent = next
      setShown((prev) => (prev === next ? prev : next))
    }

    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [name])

  return (
    <span ref={ref} className="sidebar-name" title={name}>
      {shown}
    </span>
  )
}

function FileIcon() {
  return (
    <svg className="sidebar-icon is-file" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        d="M4.1 1.8h4.7L12.6 5.5V13c0 .6-.4 1-1 1H4.1c-.6 0-1-.4-1-1V2.8c0-.6.4-1 1-1z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        d="M8.7 1.9v3.6h3.7"
      />
    </svg>
  )
}

type Props = {
  workspaceRoot: string
  currentDir: string
  activePath: string | null
  /** 父组件递增这个值时，重新读取当前目录。 */
  reloadKey: number
  onChangeDir: (dir: string) => void
  onOpenFile: (path: string) => void
}

export function FolderSidebar({
  workspaceRoot,
  currentDir,
  activePath,
  reloadKey,
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
  }, [currentDir, reloadKey])

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
              {entry.isDir ? <FolderIcon /> : <FileIcon />}
              <SidebarName name={entry.name} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
