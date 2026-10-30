import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { replaceAll } from '@milkdown/kit/utils'
import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'

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

export function CrepeEditor({
  initialMarkdown,
  onChange,
  ref,
}: Props & { ref: Ref<CrepeEditorHandle> }) {
  const hostRef = useRef<HTMLDivElement>(null)
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
      void crepe.destroy()
    }
    // 只挂载一次。换文件走 setMarkdown，不重建编辑器。
  }, [])

  return <div className="editor-host" ref={hostRef} />
}
