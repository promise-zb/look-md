#!/bin/bash
# 用刚编好的 showMD.app 打一个可双击的 pkg。
# 包 id 固定为 local.showmd.editor.pkg。版本升高后再双击，会覆盖已安装的 showMD，笔记不动。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('$root/package.json').version")"

# 本机打包在 src-tauri/target；若设置了 CARGO_TARGET_DIR，也到那里找。
search_roots=("$root/src-tauri/target")
if [ -n "${CARGO_TARGET_DIR:-}" ]; then
  search_roots+=("$CARGO_TARGET_DIR")
fi

newest() {
  local name_glob="$1"
  local type_flag="$2"
  local found=""
  local root_dir path
  for root_dir in "${search_roots[@]}"; do
    [ -d "$root_dir" ] || continue
    while IFS= read -r path; do
      [ -n "$path" ] || continue
      printf '%s %s\n' "$(stat -f '%m' "$path")" "$path"
    done < <(find "$root_dir" -name "$name_glob" -type "$type_flag" -path '*/bundle/*' 2>/dev/null)
  done | sort -nr | head -1 | cut -d' ' -f2-
}

app="$(newest 'showMD.app' d || true)"
dmg="$(newest "showMD_${version}_*.dmg" f || true)"

work="$(mktemp -d)"
mountpoint=""
cleanup() {
  if [ -n "$mountpoint" ]; then
    hdiutil detach "$mountpoint" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# 打 dmg 时 Tauri 会清掉旁边的 .app，这时从 dmg 里取出再打包。
if [ -z "$app" ]; then
  if [ -z "$dmg" ] || [ ! -f "$dmg" ]; then
    echo "找不到 showMD.app 或 showMD_${version} 的 dmg。" >&2
    exit 1
  fi
  mountpoint="$(mktemp -d)"
  hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mountpoint" >/dev/null
  if [ ! -d "$mountpoint/showMD.app" ]; then
    echo "dmg 里没有 showMD.app：$dmg" >&2
    exit 1
  fi
  ditto "$mountpoint/showMD.app" "$work/showMD.app"
  app="$work/showMD.app"
fi

case "${dmg:-}$app" in
  *aarch64*) arch="aarch64" ;;
  *x86_64*|*_x64.*) arch="x64" ;;
  *)
    case "$(uname -m)" in
      arm64) arch="aarch64" ;;
      x86_64) arch="x64" ;;
      *) arch="$(uname -m)" ;;
    esac
    ;;
esac

if [ -n "$dmg" ]; then
  out_dir="$(dirname "$dmg")"
else
  out_dir="$(cd "$(dirname "$app")/.." && pwd)/dmg"
fi
mkdir -p "$out_dir"
pkg="$out_dir/showMD_${version}_${arch}.pkg"

scripts="$(mktemp -d)"
cp "$root/scripts/macos-postinstall" "$scripts/postinstall"
chmod +x "$scripts/postinstall"

pkgbuild \
  --component "$app" \
  --install-location /Applications \
  --identifier local.showmd.editor.pkg \
  --version "$version" \
  --scripts "$scripts" \
  "$pkg"
rm -rf "$scripts"

echo "更新安装包：$pkg"
echo "双击该 pkg：装到「应用程序」，并覆盖本机已有的 showMD.app。笔记文件不会动。"
