import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { replaceAll } from '@milkdown/kit/utils'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'

import { codeCompletion } from '../codeCompletion'
import { imageDomSrc } from '../localImage'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './index.css'

/** 父组件通过 ref 读写作文。Milkdown 自己管文档，不适合再套一层受控 state。 */
export type CrepeEditorHandle = {
  getMarkdown: () => string
  setMarkdown: (markdown: string) => void
  /** 当前笔记的路径。相对图片按这个文件所在目录去找，要在 setMarkdown 之前设置。 */
  setFilePath: (filePath: string | null) => void
}

type Props = {
  initialMarkdown: string
  onChange: (markdown: string) => void
}

function scrollHostToTop(host: HTMLElement | null) {
  if (!host) return
  host.scrollTop = 0
  host.scrollLeft = 0
}

/** 拖动条只写高度。这里补上同比例的宽度，避免只裁切、看起来大小没变。 */
function fitImageBox(img: HTMLImageElement) {
  if (!img.matches('.milkdown-image-block > .image-wrapper > img')) return
  if (!img.naturalWidth || !img.naturalHeight) return
  const height = Number.parseFloat(img.style.height)
  if (!height) return
  const block = img.closest('.milkdown-image-block')
  const maxWidth = block?.clientWidth || height
  let width = (height * img.naturalWidth) / img.naturalHeight
  let nextHeight = height
  if (maxWidth > 0 && width > maxWidth) {
    width = maxWidth
    nextHeight = (maxWidth * img.naturalHeight) / img.naturalWidth
  }
  const widthPx = `${width.toFixed(2)}px`
  const heightPx = `${nextHeight.toFixed(2)}px`
  if (img.style.width !== widthPx) img.style.width = widthPx
  if (Math.abs(Number.parseFloat(img.style.height) - nextHeight) > 0.5) img.style.height = heightPx
}

type ImageMeta = {
  block: HTMLElement
  /** insert 盖住空图片块；edit 是图片出来之后再改。 */
  mode: 'insert' | 'edit'
  link: string
  caption: string
}

function locateImageBlock(view: EditorView, block: HTMLElement) {
  const pos = view.posAtDOM(block, 0)
  if (pos < 0) return null
  const doc = view.state.doc
  const at = (p: number) => {
    const node = doc.nodeAt(p)
    if (node?.type.name === 'image-block') return { pos: p, node }
    return null
  }
  const direct = at(pos) ?? at(Math.max(0, pos - 1))
  if (direct) return direct
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'image-block') {
      return { pos: $pos.before(depth), node: $pos.node(depth) }
    }
  }
  return null
}

function placeImageMeta(block: HTMLElement, shell: HTMLElement, replace: boolean) {
  const shellRect = shell.getBoundingClientRect()
  const rect = block.getBoundingClientRect()
  const width = Math.max(280, Math.min(rect.width || shellRect.width - 16, shellRect.width - 16))
  const left = Math.min(
    Math.max(8, rect.left - shellRect.left),
    Math.max(8, shellRect.width - width - 8),
  )
  if (replace) return { top: Math.max(8, rect.top - shellRect.top), left, width }
  let top = rect.bottom - shellRect.top + 8
  if (top + 132 > shellRect.height) top = Math.max(8, rect.top - shellRect.top - 132)
  return { top, left, width }
}

function safeLink(value: string) {
  const link = value.trim()
  if (/^javascript:/i.test(link)) return ''
  return link
}

export function CrepeEditor({
  initialMarkdown,
  onChange,
  ref,
}: Props & { ref: Ref<CrepeEditorHandle> }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLFormElement>(null)
  const [meta, setMeta] = useState<ImageMeta | null>(null)
  const metaRef = useRef<ImageMeta | null>(null)
  metaRef.current = meta
  const movePanelRef = useRef(() => {})
  const revealCaptionRef = useRef<(block: HTMLElement) => void>(() => {})
  const crepeRef = useRef<Crepe | null>(null)
  const readyRef = useRef(false)
  // 编辑器还没 create 完就收到打开文件时，先记下，就绪后再写入。
  const pendingRef = useRef<string | null>(null)
  // setMarkdown 会触发 markdownUpdated；用计数跳过，避免把「刚打开的文件」标成未保存。
  const skipEchoRef = useRef(0)
  const onChangeRef = useRef(onChange)
  const lastRef = useRef(initialMarkdown)
  // 图片相对路径相对这篇笔记，不相对应用页面。
  const filePathRef = useRef<string | null>(null)
  onChangeRef.current = onChange

  const applyRef = useRef<(markdown: string) => void>(() => {})
  applyRef.current = (markdown: string) => {
    const crepe = crepeRef.current
    if (!crepe) return
    skipEchoRef.current += 1
    crepe.editor.action(replaceAll(markdown, true))
    // 光标放到文首。否则换文件后选区还留在上一篇的位置。
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    })
    // replaceAll 之后 ProseMirror 还会改滚动位置，多补两帧才能停在顶部。
    const host = hostRef.current
    scrollHostToTop(host)
    requestAnimationFrame(() => {
      scrollHostToTop(host)
      requestAnimationFrame(() => scrollHostToTop(host))
    })
  }

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      const crepe = crepeRef.current
      if (crepe && readyRef.current) {
        try {
          lastRef.current = crepe.getMarkdown()
        } catch {
          // 编辑器正在销毁时 getMarkdown 会抛，沿用上一份文本。
        }
      }
      return lastRef.current
    },
    setMarkdown: (markdown: string) => {
      lastRef.current = markdown
      if (!crepeRef.current || !readyRef.current) {
        pendingRef.current = markdown
        return
      }
      pendingRef.current = null
      applyRef.current(markdown)
    },
    setFilePath: (filePath: string | null) => {
      filePathRef.current = filePath
    },
  }))

  useEffect(() => {
    const root = hostRef.current
    if (!root) return

    const crepe = new Crepe({
      root,
      defaultValue: initialMarkdown,
      features: {
        // 关掉联网的 AI 补全，保证离线可用。
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: '开始写作…',
          mode: 'block',
        },
        // 只改界面上的图片地址，写回磁盘的仍是 Markdown 里的原路径。
        [Crepe.Feature.ImageBlock]: {
          proxyDomURL: (url) => imageDomSrc(url, filePathRef.current),
          blockConfirmButton: '确认',
          blockUploadButton: '上传文件',
          blockUploadPlaceholderText: '或粘贴链接',
          blockCaptionPlaceholderText: '填写图片说明',
          inlineUploadButton: '上传',
          inlineUploadPlaceholderText: '或粘贴链接',
        },
        [Crepe.Feature.CodeMirror]: {
          extensions: [codeCompletion],
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: '文本',
            text: { label: '正文' },
            h1: { label: '标题 1' },
            h2: { label: '标题 2' },
            h3: { label: '标题 3' },
            h4: { label: '标题 4' },
            h5: { label: '标题 5' },
            h6: { label: '标题 6' },
            quote: { label: '引用' },
            divider: { label: '分割线' },
          },
          listGroup: {
            label: '列表',
            bulletList: { label: '无序列表' },
            orderedList: { label: '有序列表' },
            taskList: { label: '待办列表' },
          },
          advancedGroup: {
            label: '高级',
            image: { label: '图片' },
            codeBlock: { label: '代码块' },
            table: { label: '表格' },
            math: { label: '公式' },
          },
        },
      },
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        lastRef.current = markdown
        // 初始化阶段的回写不是用户编辑，等就绪后再计入未保存。
        if (!readyRef.current) return
        if (skipEchoRef.current > 0) {
          skipEchoRef.current -= 1
          return
        }
        onChangeRef.current(markdown)
      })
    })

    crepeRef.current = crepe
    // 拖动条上的按下要留给缩放，不能再冒泡成整块图片的拖动。
    const keepResize = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.image-resize-handle')) return
      event.preventDefault()
      event.stopPropagation()
    }
    root.addEventListener('mousedown', keepResize, true)
    root.addEventListener('dragstart', keepResize, true)
    const imageSizes = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof HTMLImageElement) fitImageBox(record.target)
      }
    })
    imageSizes.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] })

    const movePanel = () => {
      const current = metaRef.current
      const panel = panelRef.current
      const shell = shellRef.current
      if (!current || !panel || !shell || !current.block.isConnected) return
      const pos = placeImageMeta(current.block, shell, current.mode === 'insert')
      panel.style.top = `${pos.top}px`
      panel.style.left = `${pos.left}px`
      panel.style.width = `${pos.width}px`
    }
    movePanelRef.current = movePanel

    const syncInsert = () => {
      const edit = root.querySelector('.milkdown-image-block > .image-edit')
      const block = edit?.closest('.milkdown-image-block')
      if (!(block instanceof HTMLElement)) {
        const current = metaRef.current
        if (current?.mode === 'insert') current.block.classList.remove('image-meta-host')
        return
      }
      block.classList.add('image-meta-host')
      if (metaRef.current?.block === block || metaRef.current?.mode === 'edit') return
      const next: ImageMeta = { block, mode: 'insert', link: '', caption: '' }
      metaRef.current = next
      setMeta(next)
    }

    // 插入后要用一次不受信任的 pointerdown 把说明输入展开。这次不要拦，其余点击都改成编辑链接和说明。
    let revealingCaption = false

    const onCaptionIcon = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const icon = target.closest('.milkdown-image-block .image-wrapper .operation-item')
      if (!icon) return
      const block = icon.closest('.milkdown-image-block')
      if (!(block instanceof HTMLElement)) return
      if (revealingCaption) return
      event.preventDefault()
      event.stopPropagation()
      const crepeNow = crepeRef.current
      const shell = shellRef.current
      if (!crepeNow || !shell) return
      crepeNow.editor.action((ctx) => {
        const found = locateImageBlock(ctx.get(editorViewCtx), block)
        if (!found) return
        const next: ImageMeta = {
          block,
          mode: 'edit',
          link: String(found.node.attrs.src ?? ''),
          caption: String(found.node.attrs.caption ?? ''),
        }
        metaRef.current = next
        setMeta(next)
      })
    }

    const revealCaption = (block: HTMLElement) => {
      if (!block.isConnected || block.querySelector('.caption-input')) return
      const icon = block.querySelector('.image-wrapper .operation-item')
      if (!(icon instanceof HTMLElement)) return
      revealingCaption = true
      icon.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      revealingCaption = false
    }
    revealCaptionRef.current = revealCaption

    const onHoverIcon = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const icon = target.closest('.milkdown-image-block .image-wrapper .operation-item')
      if (icon instanceof HTMLElement && !icon.title) icon.title = '编辑链接和图片说明'
    }

    root.addEventListener('pointerdown', onCaptionIcon, true)
    root.addEventListener('pointerover', onHoverIcon)
    root.addEventListener('scroll', movePanel)
    const forms = new MutationObserver(() => syncInsert())
    forms.observe(root, { subtree: true, childList: true })

    void crepe.create().then(() => {
      readyRef.current = true
      const pending = pendingRef.current
      if (pending !== null) {
        pendingRef.current = null
        applyRef.current(pending)
      }
    })

    return () => {
      readyRef.current = false
      crepeRef.current = null
      root.removeEventListener('mousedown', keepResize, true)
      root.removeEventListener('dragstart', keepResize, true)
      root.removeEventListener('pointerdown', onCaptionIcon, true)
      root.removeEventListener('pointerover', onHoverIcon)
      root.removeEventListener('scroll', movePanel)
      imageSizes.disconnect()
      forms.disconnect()
      void crepe.destroy()
    }
    // 只挂载一次。换文件走 setMarkdown，不重建编辑器。
  }, [])

  useLayoutEffect(() => {
    movePanelRef.current()
  }, [meta])

  const saveMeta = (event: FormEvent) => {
    event.preventDefault()
    const current = metaRef.current
    const crepe = crepeRef.current
    if (!current || !crepe || !current.block.isConnected || !safeLink(current.link)) return
    current.block.classList.remove('image-meta-host')
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const found = locateImageBlock(view, current.block)
      if (!found) return
      let tr = view.state.tr
      tr = tr.setNodeAttribute(found.pos, 'src', safeLink(current.link))
      tr = tr.setNodeAttribute(found.pos, 'caption', current.caption)
      if (tr.docChanged) view.dispatch(tr)
      requestAnimationFrame(() => {
        if (current.caption.trim()) revealCaptionRef.current(current.block)
      })
    })
    metaRef.current = null
    setMeta(null)
  }

  const closeMeta = () => {
    const current = metaRef.current
    metaRef.current = null
    setMeta(null)
    if (current?.mode !== 'insert' || !current.block.isConnected) return
    current.block.classList.remove('image-meta-host')
    const crepe = crepeRef.current
    if (!crepe) return
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const found = locateImageBlock(view, current.block)
      if (!found) return
      view.dispatch(view.state.tr.delete(found.pos, found.pos + found.node.nodeSize))
    })
  }

  return (
    <div className="editor-shell" ref={shellRef}>
      <div className="editor-host" ref={hostRef} />
      {meta && (
        <form
          className="image-meta"
          ref={panelRef}
          onSubmit={saveMeta}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeMeta()
          }}
        >
          <label>
            <span>链接</span>
            <input
              value={meta.link}
              autoFocus={meta.mode === 'insert'}
              onChange={(event) => {
                const next = { ...meta, link: event.target.value }
                metaRef.current = next
                setMeta(next)
              }}
            />
          </label>
          <label>
            <span>图片说明</span>
            <input
              value={meta.caption}
              placeholder="图片说明"
              onChange={(event) => {
                const next = { ...meta, caption: event.target.value }
                metaRef.current = next
                setMeta(next)
              }}
            />
          </label>
          <div className="image-meta-actions">
            <button type="button" onClick={closeMeta}>
              关闭
            </button>
            <button type="submit">确认</button>
          </div>
        </form>
      )}
    </div>
  )
}
