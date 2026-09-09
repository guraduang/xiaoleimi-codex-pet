#!/usr/bin/env bash
# Sourced by scripts which already enable set -euo pipefail.
resolve_runtime() {
  ASAR_PATH=${CHATGPT_ASAR_PATH:-${1:-}}
  if [[ -z "$ASAR_PATH" ]]; then
    local candidate
    for candidate in /usr/lib/chatgpt/resources/app.asar /usr/lib64/chatgpt/resources/app.asar /opt/chatgpt/resources/app.asar /opt/ChatGPT/resources/app.asar; do
      if [[ -f "$candidate" ]]; then ASAR_PATH=$candidate; break; fi
    done
  fi
  [[ -n "$ASAR_PATH" && -f "$ASAR_PATH" ]] || { echo '找不到 app.asar；设置 CHATGPT_ASAR_PATH 或传入路径。' >&2; return 1; }
  ASAR_PATH=$(realpath "$ASAR_PATH")
  NODE_BIN=$(command -v node || true)
  if [[ -z "$NODE_BIN" && -x "$(dirname "$ASAR_PATH")/cua_node/bin/node" ]]; then NODE_BIN="$(dirname "$ASAR_PATH")/cua_node/bin/node"; fi
  [[ -n "$NODE_BIN" ]] || { echo '需要 Node.js' >&2; return 1; }
}
json_field() {
  printf '%s' "$1" | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s)[process.argv[1]]??"")))' "$2"
}
require_closed() {
  if [[ $(uname -s) != Linux ]]; then echo '增强补丁仅适配 Linux；其他平台请使用素材安装。' >&2; return 1; fi
  if pgrep -x 'ChatGPT|chatgpt|codex-desktop' >/dev/null 2>&1; then
    echo '客户端正在运行。请先正常退出，再从系统终端执行此脚本。不会强制关闭或重启。' >&2; return 3
  fi
}
atomic_replace() {
  local candidate
  # Stage next to destination so rename is atomic; sudo is scoped to these file operations.
  if [[ -w $(dirname "$ASAR_PATH") ]]; then
    candidate=$(mktemp "$(dirname "$ASAR_PATH")/.xiaoleimi-asar.XXXXXX")
    if ! install -m 0644 "$1" "$candidate" || ! mv -f -- "$candidate" "$ASAR_PATH"; then rm -f -- "$candidate"; return 1; fi
  else
    candidate=$(sudo mktemp "$(dirname "$ASAR_PATH")/.xiaoleimi-asar.XXXXXX")
    if ! sudo install -m 0644 "$1" "$candidate" || ! sudo mv -f -- "$candidate" "$ASAR_PATH"; then sudo rm -f -- "$candidate"; return 1; fi
  fi
}
