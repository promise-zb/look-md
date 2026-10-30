/** 同时认 `/` 和 `\`，Mac、Windows 都能取出文件名。 */
export function fileName(path: string | null): string {
  if (!path) return '未命名'
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

type Props = {
  path: string | null
  dirty: boolean
  currentDir: string | null
  onNew: () => void
  onOpen: () => void
  onOpenFolder: () => void
  onRefresh: () => void
  onSave: () => void
}

export function AppHeader({
  path,
  dirty,
  currentDir,
  onNew,
  onOpen,
  onOpenFolder,
  onRefresh,
  onSave,
}: Props) {
  return (
    <header className="chrome">
      <span className="doc-name" title={path ?? ''}>
        {fileName(path)}
        {dirty ? ' ●' : ''}
      </span>
      <div className="actions">
        <button type="button" onClick={onNew}>
          新建
        </button>
        <button type="button" onClick={() => void onOpen()}>
          打开
        </button>
        <button type="button" onClick={() => void onOpenFolder()}>
          打开文件夹
        </button>
        <button
          type="button"
          disabled={!currentDir}
          title={currentDir ? '重新读取当前目录' : '还没有打开文件夹'}
          onClick={onRefresh}
        >
          刷新
        </button>
        <button type="button" onClick={() => void onSave()}>
          保存
        </button>
      </div>
    </header>
  )
}
