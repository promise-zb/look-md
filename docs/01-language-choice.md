# 1. 语言怎么选

约束：**可安装的 Mac 应用、安装后只在本地跑、不联网。** 下面按「适不适合 showMD」排，不是按语言热度。

## 1.1 一句话对照

| 语言 / 栈 | 当壳 | 当编辑器 | 安装包体感 | 结论 |
| --- | --- | --- | --- | --- |
| **Swift** + WKWebView | 最优（菜单、文件对话框、打印、深色模式） | 编辑器仍建议 Web 里做 | 最小，系统已有 WebKit | **只做 Mac 的第一选择** |
| **Rust + Tauri 2（本仓库已落地，代码在仓库根）** | 很好：系统 WebView + 小体积 | 前端 TS；Rust 做 IO/解析 | 大约数 MB～十几 MB 量级，远小于 Electron | **跨平台或偏 Rust 时的第一选择** |
| **Go** + **Wails v2/v3** | 能用，和 Tauri 同类 | 同上，解析可用 goldmark | 中等 | 团队只想写 Go 时的合理备选 |
| **TypeScript** + **Electron** | 成熟、和 VS Code 同类 | 生态最全 | 内嵌 Chromium，上百 MB、内存高 | 原型可以，正式版不优 |
| **Python** + Qt / Tk / 自建 WKWebView | 窗口能起来 | **没有**能打的 WYSIWYG 生态 | 捆绑解释器，大且脆 | **淘汰**（工具类可以，编辑器不行） |
| 纯 **Rust** GUI（egui / gpui / iced） | 能画窗口 | 从零做 Markdown WYSIWYG 极重 | 小 | 除非做阅读器，否则周期过长 |
| 纯 **Go** GUI（Fyne / Gio） | 能画 | 同上 | 中 | 不适合 Typora 级编辑 |

## 1.2 Swift（只做 Mac 时最优）

- 系统级：`NSDocument` 管打开/保存/未保存圆点、版本浏览；`NSOpenPanel`；打印 PDF。
- 渲染：`WKWebView` 加载 **file:// 或自定义 URL scheme** 指向包内的编辑器页面（禁止默认联网）。
- 和诊断类小工具的差别：那种是「本地 HTTP + 简单页」；showMD 要长期驻留的编辑器，应用 **WKWebView 直接加载包内 HTML**，不要再起 Python 服务器。
- 代价：Windows 以后要另做壳（或那时再加 Tauri）。公式/所见即所得仍然要写（或嵌入）前端，Swift 本身不提供 Milkdown。

适合：目标就是 macOS，要菜单栏、拖文件到 Dock、`.md` 关联都「像系统软件」。

## 1.3 Rust + Tauri 2（综合第二、跨平台第一）

**showMD 已按这条实现**（仓库根：Tauri 2 + React 19 + Milkdown Crepe 7）。

Tauri **2**（2024 起正式线）：壳是 Rust，UI 是你熟悉的 Vite + TS/React，窗口是 **系统 WebView**（Mac 上还是 WebKit，不内嵌 Chrome）。

开源 Markdown 桌面项目近年大量走这条：Milkdown Crepe 做 WYSIWYG，Rust 侧 `notify` 监视文件、`comrak`/`pulldown-cmark` 解析、 Tantivy 做全文检索（第二期）。

离线：`tauri.conf` 关掉浏览器打开外链的默认行为；CSP 只允许 `tauri:` / 本地资源；KaTeX/Mermaid **打进前端包**。

适合：前端用 React 19 + Vite，又愿意写一点 Rust 管文件。Mac 安装用 `tauri build` 出 `.app` / `.dmg`。

## 1.4 Go + Wails

模式与 Tauri 相同（Go 二进制 + WebView）。Markdown 解析 **goldmark** 很强。桌面插件、打包文档、社区例子比 Tauri 少。若日常语言是 Go、且接受自己接 Milkdown，可选；**不是**「比 Rust 更适合编辑器」。

不要用纯 Fyne 画富文本：表格、公式、光标在「渲染后的标题」里编辑，工作量等于再造一个浏览器排版引擎。

## 1.5 Python：为什么明确不推荐

Python 能做 **Mac .app + 本地 UI**，适合诊断工具：页面简单、用完就关。

编辑器要：低延迟输入、IME 中文、大文档、撤销栈、选区。Python GUI（Qt/Tk）或「Python 起 HTTP + WKWebView」会变成：

- 用户机器必须带解释器，或你把整份 CPython 打进包（大、签名麻烦）；
- 没有 ProseMirror 级别的 Python 编辑器；
- 性能和输入法问题会一直烦。

公式、Mermaid 最后还是要嵌 JS。与其 Python 包一层 JS，不如壳用 Swift/Rust，JS 只留在 WebView。

## 1.6 Electron / 纯前端

Typora 早期、VS Code、Obsidian 证明这条能做完产品。离线也没问题（资源打进 asar）。代价是 **每个用户开一个 Chromium**。showMD 若追求「装上像 Typora 现在这样轻」，不要选 Electron 当终局。

可用它做 **两周的交互原型**，验证 WYSIWYG 手感，再把同一套前端搬进 Tauri 或 WKWebView。

## 1.7 推荐决策

```text
只做 macOS 且想要最像系统应用
    → Swift 壳 + 包内 Web 编辑器（Milkdown）

会 React + Vite，且接受学一点 Rust / 以后要 Windows
    → Tauri 2 + Rust + 同一套 Milkdown

只会 Go
    → Wails + Milkdown（接受少一点现成轮子）

只会 Python
    → 先把编辑器当 Web 原型（Vite），壳改用 Swift 或 Tauri；不要 PyQt 硬做 Typora
```

**最优语言不是某一个，是两层：壳用 Swift 或 Rust，编辑器用 TypeScript。** Go 可替换 Rust 做壳；Python 不要做壳也不要做编辑器。
