import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { AppHeader, fileName } from './AppHeader'
import { CrepeEditor } from './CrepeEditor'
import type { CrepeEditorHandle } from './CrepeEditor'
import { FolderSidebar, dirOfFile, samePath } from './FolderSidebar'
import { WELCOME_MARKDOWN } from './welcome'
import './App.css'

/**
 * 主界面：顶栏、文件夹侧栏、编辑器。
 *
 * 读写磁盘在 Rust（read_markdown / write_markdown / list_dir）。
 * 系统菜单发 new / open / open_folder / save / save_as，和顶栏按钮走同一套函数。
 * 访达或资源管理器双击文件时，Rust 发 open_path，这里直接载入那一篇。
 *
 * path、dirty 各存两份：state 驱动界面，ref 给只注册一次的菜单回调读最新值。
 */

const MD_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
const SIDEBAR_MIN = 240
const SIDEBAR_MAX_RATIO = 0.3

function clampSidebarWidth(width: number, total: number) {
  const max = Math.max(SIDEBAR_MIN, total * SIDEBAR_MAX_RATIO)
  return Math.min(max, Math.max(SIDEBAR_MIN, width))
}

export default function App() {
  const editorRef = useRef<CrepeEditorHandle>(null)
  const pathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const savedRef = useRef(WELCOME_MARKDOWN)

  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [dirReload, setDirReload] = useState(0)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const clamp = () => {
      setSidebarWidth((width) => clampSidebarWidth(width, workspace.clientWidth))
    }
    clamp()
    const observer = new ResizeObserver(clamp)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  const onSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const workspace = workspaceRef.current
    if (!workspace) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = sidebarWidth
    handle.setPointerCapture(event.pointerId)
    setResizing(true)
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + ev.clientX - startX, workspace.clientWidth))
    }
    const onUp = () => {
      setResizing(false)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const onSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const total = workspaceRef.current?.clientWidth ?? 0
    const step = event.shiftKey ? 32 : 16
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSidebarWidth((width) => clampSidebarWidth(width - step, total))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((width) => clampSidebarWidth(width + step, total))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MIN)
    } else if (event.key === 'End') {
      event.preventDefault()
      setSidebarWidth(clampSidebarWidth(total, total))
    }
  }

  const syncTitle = useCallback(async (nextPath: string | null, nextDirty: boolean) => {
    const mark = nextDirty ? ' ●' : ''
    await getCurrentWindow().setTitle(`${fileName(nextPath)}${mark} — LookMD`)
  }, [])

  const markDirty = useCallback(
    (markdown: string) => {
      const next = markdown !== savedRef.current
      dirtyRef.current = next
      setDirty(next)
      void syncTitle(pathRef.current, next)
    },
    [syncTitle],
  )

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true
    return window.confirm('有未保存的修改，确定丢弃？')
  }, [])

  const loadFile = useCallback(
    async (filePath: string) => {
      const text = await invoke<string>('read_markdown', { path: filePath })
      pathRef.current = filePath
      savedRef.current = text
      dirtyRef.current = false
      setPath(filePath)
      setDirty(false)
      editorRef.current?.setFilePath(filePath)
      editorRef.current?.setMarkdown(text)
      void syncTitle(filePath, false)
      // 已经打开过文件夹时不改工作区，只在还没有侧栏时用文件所在目录当根。
      const folder = dirOfFile(filePath)
      setCurrentDir((prev) => prev ?? folder)
      setWorkspaceRoot((prev) => prev ?? folder)
    },
    [syncTitle],
  )

  const doNew = useCallback(() => {
    if (!confirmDiscard()) return
    pathRef.current = null
    savedRef.current = WELCOME_MARKDOWN
    dirtyRef.current = false
    setPath(null)
    setDirty(false)
    editorRef.current?.setFilePath(null)
    editorRef.current?.setMarkdown(WELCOME_MARKDOWN)
    void syncTitle(null, false)
  }, [confirmDiscard, syncTitle])

  const doOpen = useCallback(async () => {
    if (!confirmDiscard()) return
    const selected = await open({ multiple: false, filters: MD_FILTERS })
    if (selected === null || Array.isArray(selected)) return
    await loadFile(selected)
  }, [confirmDiscard, loadFile])

  const doOpenFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (selected === null || Array.isArray(selected)) return
    setWorkspaceRoot(selected)
    setCurrentDir(selected)
  }, [])

  const persist = useCallback(
    async (target: string) => {
      const contents = editorRef.current?.getMarkdown() ?? ''
      await invoke('write_markdown', { path: target, contents })
      pathRef.current = target
      savedRef.current = contents
      dirtyRef.current = false
      setPath(target)
      setDirty(false)
      editorRef.current?.setFilePath(target)
      void syncTitle(target, false)
      const folder = dirOfFile(target)
      setCurrentDir((prev) => prev ?? folder)
      setWorkspaceRoot((prev) => prev ?? folder)
      setDirReload((n) => n + 1)
    },
    [syncTitle],
  )

  const refreshDir = useCallback(() => {
    if (!currentDir) return
    setDirReload((n) => n + 1)
  }, [currentDir])

  const doSave = useCallback(async () => {
    const current = pathRef.current
    if (current) {
      await persist(current)
      return
    }
    const target = await save({ filters: MD_FILTERS, defaultPath: 'untitled.md' })
    if (!target) return
    await persist(target)
  }, [persist])

  const doSaveAs = useCallback(async () => {
    const currentName = fileName(pathRef.current)
    const target = await save({
      filters: MD_FILTERS,
      defaultPath: currentName === '未命名' ? 'untitled.md' : currentName,
    })
    if (!target) return
    await persist(target)
  }, [persist])

  const openFromSidebar = useCallback(
    (filePath: string) => {
      if (!confirmDiscard()) return
      void loadFile(filePath)
    },
    [confirmDiscard, loadFile],
  )

  // 正在打开的路径。Mac 上 argv 和 Opened 可能各来一次，避免读两遍。
  const openingPathRef = useRef<string | null>(null)
  const openFromSystem = useCallback(
    (filePath: string) => {
      if (!filePath) return
      if (openingPathRef.current && samePath(openingPathRef.current, filePath)) return
      if (pathRef.current && samePath(pathRef.current, filePath)) return
      openingPathRef.current = filePath
      if (!confirmDiscard()) {
        openingPathRef.current = null
        return
      }
      void loadFile(filePath)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          window.alert(`无法打开文件\n${message}`)
        })
        .finally(() => {
          if (openingPathRef.current && samePath(openingPathRef.current, filePath)) {
            openingPathRef.current = null
          }
        })
    },
    [confirmDiscard, loadFile],
  )

  // 菜单监听只挂一次。函数放进 ref，避免闭包拿到旧的 doSave。
  const handlersRef = useRef({
    doNew,
    doOpen,
    doOpenFolder,
    doSave,
    doSaveAs,
    openFromSystem,
  })
  handlersRef.current = { doNew, doOpen, doOpenFolder, doSave, doSaveAs, openFromSystem }

  useEffect(() => {
    const unlisten = Promise.all([
      listen('new', () => handlersRef.current.doNew()),
      listen('open', () => void handlersRef.current.doOpen()),
      listen('open_folder', () => void handlersRef.current.doOpenFolder()),
      listen('save', () => void handlersRef.current.doSave()),
      listen('save_as', () => void handlersRef.current.doSaveAs()),
      listen<string>('open_path', (event) => handlersRef.current.openFromSystem(event.payload)),
    ])
    // 先挂监听，再取启动时就到的路径，避免事件夹在中间丢掉。
    void invoke<string | null>('take_pending_open').then((filePath) => {
      if (filePath) handlersRef.current.openFromSystem(filePath)
      else void syncTitle(null, false)
    })
    return () => {
      void unlisten.then((fns) => fns.forEach((fn) => fn()))
    }
  }, [syncTitle])

  return (
    <div className="shell">
      <AppHeader
        path={path}
        dirty={dirty}
        currentDir={currentDir}
        onNew={doNew}
        onOpen={doOpen}
        onOpenFolder={doOpenFolder}
        onRefresh={refreshDir}
        onSave={doSave}
      />
      <div className={resizing ? 'workspace is-resizing' : 'workspace'} ref={workspaceRef}>
        <div className="sidebar-pane" style={{ width: sidebarWidth }}>
          {workspaceRoot && currentDir ? (
            <FolderSidebar
              workspaceRoot={workspaceRoot}
              currentDir={currentDir}
              activePath={path}
              reloadKey={dirReload}
              onChangeDir={setCurrentDir}
              onOpenFile={openFromSidebar}
            />
          ) : (
            <aside className="sidebar sidebar-idle">
              <p>点「打开文件夹」选择一个目录。进入子文件夹后，用「上一级」返回。</p>
            </aside>
          )}
        </div>
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整目录宽度"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={Math.round(Math.max(SIDEBAR_MIN, (workspaceRef.current?.clientWidth ?? 0) * SIDEBAR_MAX_RATIO))}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          title="拖动调整目录宽度"
          onPointerDown={onSplitterPointerDown}
          onKeyDown={onSplitterKeyDown}
        />
        <CrepeEditor ref={editorRef} initialMarkdown={WELCOME_MARKDOWN} onChange={markDirty} />
      </div>
    </div>
  )
}
