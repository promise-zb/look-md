# 4. Mac + Windows 安装包

Tauri **必须在对应系统上编对应的包**：这台 Mac 只能稳定打出 `.dmg`；Windows 的 `.exe` 要在 Windows 机器或 **GitHub Actions `windows-latest`** 上打。不要指望在 Mac 上交叉编译 NSIS。

## 4.1 仓库里放什么

应用就在仓库根（`src/`、`src-tauri/`、`package.json`、`scripts/pack.mjs`、`.github/workflows/release.yml`）。设计笔记在本目录。没有上层 pnpm workspace，直接：

```bash
pnpm install
pnpm pack:mac    # 仅 macOS，产物 dmg
pnpm pack:win    # 仅 Windows，产物 nsis exe
pnpm pack        # 看本机系统，二选一
```

| 你在哪台电脑编 | 得到什么 |
| --- | --- |
| macOS | `.dmg`（以及 `.app`） |
| Windows + VS Build Tools（C++） | `.exe` 安装程序（NSIS） |
| GitHub Actions（推荐） | 上面两种一起挂到 Release |

`tauri.conf.json` 里 `bundle.targets` 已是 **`dmg` + `nsis`**。在 Mac 上编时 Windows 目标会被跳过。

## 4.2 别人下载什么

| 系统 | 文件 | 怎么装 |
| --- | --- | --- |
| Mac Apple Silicon | `*_aarch64.dmg` | 打开 dmg，拖到 Applications |
| Mac Intel | `*_x64.dmg` | 同上 |
| Windows 10/11 | `*_x64-setup.exe` | 双击安装（会要 WebView2，Win10/11 一般都有） |

不要让用户去装 Rust。Release 只附安装包即可；源码可选公开。

## 4.3 自动发布

工作流：[`.github/workflows/release.yml`](../.github/workflows/release.yml)

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions 会出一份 **草稿 Release**，三份产物齐了再点 Publish。`package.json` / `tauri.conf.json` 的 `version` 请和 tag 对齐。

Mac 要「双击就开」仍需苹果公证（见 [03](./03-mac-install.md)），把证书放到 Actions Secrets 后再说。没公证也能发，说明里写 Control + 打开。

Windows SmartScreen 对未签名 exe 也会黄页，用户点「仍要运行」即可；要消掉需要 EV/代码签名证书，不是现在必须。
