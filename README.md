# showMD

本地、断网可用的 **所见即所得 Markdown 编辑器**。仓库目录是 `look-md`，Mac 上装成 `.app`。实现：**Rust + Tauri 2** + **React 19 / Vite / TypeScript** + **Milkdown Crepe**。

## 目录

| 路径 | 内容 |
| --- | --- |
| [`src/`](./src/) | 编辑器界面（React + Milkdown） |
| [`src-tauri/`](./src-tauri/) | 桌面壳（Rust / Tauri） |
| [`scripts/`](./scripts/) | 按当前系统打安装包 |
| [`docs/`](./docs/) | 选型与架构笔记 |
| [`.github/workflows/release.yml`](./.github/workflows/release.yml) | Mac + Windows 发布 |

## 怎么跑

需要：Node 20+、pnpm、Rust（`rustc` / `cargo`）、macOS 上的 Xcode Command Line Tools。

```bash
cd look-md
chmod +x install.sh
./install.sh          # pnpm install
pnpm tauri dev        # 开发：系统 WebView 打开编辑器
```

出可安装包（必须在对应系统上编；脚本在 `scripts/pack.mjs`）：

```bash
pnpm pack:mac    # 本机 macOS → .dmg
pnpm pack:win    # 仅 Windows → NSIS .exe；在 Mac 上会退出并提示改用 Actions
pnpm pack        # 按当前操作系统自动选上面其中一个
```

Mac + Windows 要一起给别人下：打 tag `v0.1.0` 推送，走 `.github/workflows/release.yml`。详见 [04](./docs/04-github-release.md)。

## 已实现

| 能力 | 做法 |
| --- | --- |
| WYSIWYG | Milkdown Crepe 7（ProseMirror），公式 KaTeX 打进包 |
| 打开 / 保存 / 另存为 | Tauri dialog + Rust `std::fs`，仅 `.md` / `.markdown` / `.txt` |
| 打开文件夹 | 访达选目录；侧栏点进子文件夹，「上一级」回到工作区根 |
| 菜单与快捷键 | ⌘N ⌘O ⌘S ⇧⌘S；编辑菜单用系统剪切板 |
| 未保存 | 标题带 `●`，新建/打开前确认 |
| 离线 | 关掉 Crepe AI；CSP 不允许外网；无 opener 插件 |
| 安装包 | Mac：`dmg`；Windows：NSIS `.exe`（见 [04](./docs/04-github-release.md)） |

未做（第二期）：文件夹侧栏、导出 PDF、Mermaid、图片写入磁盘旁、Sparkle 更新。

## 语言为什么是这一套

见 [01 语言对比](./docs/01-language-choice.md)。壳是 Rust（体积小、系统 WebKit），编辑器仍是 TS。

## 怎么读

| | 文档 |
| --- | --- |
| 0 | [Typora 要复现什么](./docs/00-typora-what.md) |
| 1 | [语言对比](./docs/01-language-choice.md) |
| 2 | [本地架构](./docs/02-architecture.md) |
| 3 | [做成 .app](./docs/03-mac-install.md) |
| 4 | [Mac + Windows 安装包](./docs/04-github-release.md) |
