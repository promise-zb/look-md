# 2. 本地架构（安装后不联网）

## 2.1 进程怎么分

已实现（仓库根）：

```text
showMD.app
├─ 原生进程（Tauri 2 / Rust）
│    打开/保存、菜单、窗口标题
│    只读写用户选中的路径，不访问网络
└─ WebView（系统 WebKit）
     Vite 打出来的 React + Milkdown Crepe
     KaTeX 打进包；Crepe AI 关闭
```

断网检查：开发时用 Charles/Whistle 看 WebView **零** HTTP。`WKWebView` 设 `WKAppBoundDomains` 或干脆不用 http(s) 加载页面，用 `loadFileURL` / Tauri 自定义协议。

## 2.2 数据永远在磁盘上

- 打开：原生读文件 → UTF-8 字符串 → 交给编辑器 `setMarkdown()`。
- 保存：编辑器 `getMarkdown()` → 原生原子写（写临时文件再 replace），避免断电截断。
- **不要**把正文放到云；偏好设置用 `UserDefaults` 或 `~/Library/Preferences`。
- 自动保存：防抖 1～2 秒，仅对「已有路径」的文件；未命名文档只留内存 + 崩溃恢复（本地 json）。

## 2.3 编辑器引擎（这一层与壳语言无关）

| 库 | 角色 |
| --- | --- |
| **Milkdown Crepe**（基于 ProseMirror） | 目前开源里最接近 Typora「就地编辑」的方案 |
| CodeMirror 6 | 源码模式（想看 `**粗体**` 时切过去） |
| KaTeX | 数学，npm 包进仓库，CSS/字体一起打 |
| Mermaid | 流程图，同样打包；大文档可懒加载但文件仍在 .app 内 |
| highlight.js / Shiki | 代码块；Shiki 更重，离线要把主题 JSON 打进包 |

不要运行时 `import('https://cdn…')`。构建用本仓库熟悉的 **Vite** 打成一组静态文件，再嵌进 `.app` 的 `Resources`。

## 2.4 Markdown 往返

WYSIWYG 的坑：**HTML → Markdown 必须稳定**，否则一保存，别人的列表/表格被改格式。

- 以 **Markdown 为唯一真相**；ProseMirror 文档是会话态。
- 保存前走 Milkdown/remark 的 serializer，用同一套 GFM 选项。
- 可选：Rust `comrak` / Go `goldmark` 只做大纲提取、纯预览校验，不要两套序列化抢。

## 2.5 权限与「完全本地」

macOS 即使用户以为是本地应用，也要在 `Info.plist` 声明：

- 文档类型：`net.daringfireball.markdown` / `.md`
- **不要**开 App Sandbox 若你要任意路径打开（沙箱下用户目录外很烦）。自己分发 `.dmg` 可以不用沙箱；上 Mac App Store 则必须沙箱 + 用户选文件。
- `NSAppTransportSecurity`：禁止任意 http；本应用根本不该发请求。
- Tauri：capability 只开 `fs` 的用户选中范围 + `dialog`；不要 `http` 权限。

## 2.6 和前端工程的关系

编辑器页面用 **React 19 + Vite**。这是一个独立小前端，产物是静态文件，给 WebView 加载。不要把 showMD 塞进别的 monorepo 微前端路由里。
