/** Mac 的 WebKit UA 含 Macintosh，Windows 的 WebView2 UA 含 Windows。 */
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

const keyNew = isMac ? '⌘N' : 'Ctrl+N'
const keyOpen = isMac ? '⌘O' : 'Ctrl+O'
const keyOpenFolder = isMac ? '⇧⌘O' : 'Ctrl+Shift+O'
const keySave = isMac ? '⌘S' : 'Ctrl+S'
const keySaveAs = isMac ? '⇧⌘S' : 'Ctrl+Shift+S'

export const WELCOME_MARKDOWN = `# showMD

本地 Markdown 编辑器：所见即所得，文件只存在你的磁盘上，**不联网**。

## 用法

- **${keyNew}** 新建 · **${keyOpen}** 打开文件 · **${keyOpenFolder}** 打开文件夹 · **${keySave}** 保存 · **${keySaveAs}** 另存为
- 直接在文档里写，标题、列表、表格会马上变成排版后的样子
- 源码始终是普通 \`.md\`，用别的编辑器也能打开

## 语法示例

**粗体**、*斜体*、\`行内代码\`、~~删除线~~。

- 无序列表
- [ ] 待办
- [x] 已完成

1. 有序一项
2. 有序二项

> 引用

\`\`\`ts
function hello(name: string) {
  return \`hi, \${name}\`
}
\`\`\`

| 列 A | 列 B |
| --- | --- |
| 本地 | 离线 |

行内公式 $E = mc^2$，块公式：

$$
\\int_0^1 x^2 \\\, dx
$$

---

从菜单 **文件 → 打开** 选一篇笔记开始写。
`
