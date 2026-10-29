#!/bin/bash
# macOS 安装依赖。Windows 请双击或运行 install.cmd。
set -euo pipefail
cd "$(dirname "$0")"
pnpm install
echo "依赖已装。开发：pnpm desktop"
echo "打 Mac 安装包：pnpm pack:mac"
echo "打 Windows 安装包：在 Windows 上 pnpm pack:win（本机 Mac 会直接报错）"
echo "两边一起出：git tag v0.1.0 && git push --tags（GitHub Actions）"
