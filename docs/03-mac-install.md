# 3. 做成能在 Mac 上安装的应用

本仓库已按 **Rust + Tauri 2 + React/Vite** 落地，代码在仓库根。运行：`./install.sh && pnpm tauri dev`。

目标：用户拿到 **LookMD.app**（或带它的 `.dmg`），拖到「应用程序」，双击即用，**不依赖**系统是否装了 Node / Python / Rust。

## 3.1 分发形态

| 方式 | 说明 |
| --- | --- |
| `.app` 文件夹 | macOS 应用的本质；可直接拷到 `/Applications` |
| `.dmg` | 常见分发：打开窗口让用户拖到 Applications |
| Homebrew Cask | 以后有稳定下载 URL 再做 |
| Mac App Store | 要沙箱、公证、苹果抽成；任意打开用户文件夹不友好。LookMD 这种「打开任意 md」更适合 **官网 dmg + 公证**，与 Typora 现行渠道类似 |

若用 **Swift**：Xcode 出 Archive。若用 **Tauri**：`pnpm tauri build` 在 `src-tauri/target/release/bundle/macos/` 出 `.app`。

## 3.2 公证（Notarization）

从网上下载的 app，Gatekeeper 会拦。正式给别人用需要：

1. Apple Developer 账号（年费）
2. 签名 `Developer ID Application`
3. `notarytool` 公证 + `stapler`

自己电脑 `xattr -cr LookMD.app` 只能骗自己，不能当发布流程。

架构：打 **Universal**（`arm64 + x86_64`），或只出 Apple Silicon（2026 年一般够用）。本机若是 Intel，默认产物文件名带 `x64`；别人用 M 系列芯片时，应用会走 Rosetta，或你再打一份 `aarch64-apple-darwin` / universal。

## 3.2.1 传到 GitHub 给别人装

**支持。** 别人不必装 Node / Rust。流程：

1. 仓库设为 **Public**（或 Release 对有权限的人可见）。私有仓库外人下不到安装包。
2. `pnpm tauri build` 得到 `LookMD_0.1.0_*.dmg`（约数 MB～十几 MB）。
3. GitHub → **Releases** → 新建 tag（如 `v1.0.0`）→ 把 **dmg 当附件** 上传。说明里写：打开 dmg，把 LookMD 拖到 Applications。

不要把 `node_modules`、`src-tauri/target` 推进 Git（已在 `.gitignore`）。源码可以一起公开，方便别人改；安装包靠 Release 附件，不要指望 clone 下来就能双击。

**Gatekeeper：** 从网上下载、又没公证时，macOS 会提示「无法打开，因为无法验证开发者」。别人可以：Control 点击 → 打开。这能用，但不像正规软件。要双击即开，需要苹果开发者账号做 [3.2 公证](#32-公证notarization)。没有账号也可以先发 dmg，在 Release 说明里写清这一步。

以后可用 GitHub Actions 的 `macos-latest` 跑 `tauri-action` 自动编包并挂到 Release；那是下一阶段，不是现在的硬条件。

## 3.3 体积预期

| 栈 | 用户磁盘（量级） |
| --- | --- |
| Swift + 一套 Vite 编辑器资源 | 小：原生二进制数 MB + 前端/字体十到几十 MB（KaTeX/Mermaid 会占） |
| Tauri 2 + 同上前端 | 同类，Rust 二进制略大一点 |
| Electron | 往往 150MB+，还要 Chromium 常驻内存 |

离线公式/图表几乎必然带上 KaTeX 字体和 mermaid，这是功能税，与用哪种壳无关。

## 3.4 文件关联

`Info.plist` 注册 `public.plain-text` 的 `.md` / `.markdown`。用户在「访达 → 显示简介 → 打开方式」里选 LookMD。Tauri 有 bundle 文件类型配置。

## 3.5 建议的实现顺序（避免一上来铺太大）

1. **Web 原型**（浏览器里也行）：Milkdown 打开一个字符串，导出 Markdown，确认中文输入法、撤销、表格。
2. **套壳**：Swift 或 Tauri，`load` 本地 html，桥接 `readFile`/`writeFile`。
3. **NSDocument / 未保存状态**、最近文件、`.md` 关联。
4. KaTeX → Mermaid → 大纲 → 文件夹侧栏。
5. 导出 PDF（打印）、主题 CSS。
6. 公证和 dmg。

第 1 步不依赖最终语言；第 2 步才锁定 Swift 还是 Rust。

## 3.6 不要做的

- 启动时检查更新（那就是联网）。要更新就用户自己下新 dmg，或以后再加可选的 Sparkle（Typora 用过 Sparkle；那是显式联网，与「功能不联网」可分开）。
- 把笔记同步到自己的服务器。
- 用 Python 解释器当运行时依赖（和「安装后即用」冲突，除非把整个 CPython 打进包——仍然不优）。
