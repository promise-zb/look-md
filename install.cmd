@echo off
rem Windows 安装依赖。Mac 请用 install.sh。
cd /d "%~dp0"
pnpm install
if errorlevel 1 exit /b 1
echo 依赖已装。开发：pnpm desktop
echo 打 Windows 安装包：pnpm pack:win
echo 打 Mac 安装包：在 macOS 上 pnpm pack:mac
echo 两边一起出：git tag v0.1.0 然后 git push --tags
