#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_PATH=${1:-}
ASAR_PATH=${CHATGPT_ASAR_PATH:-${2:-/usr/lib/chatgpt/resources/app.asar}}

if [[ -z "$BACKUP_PATH" || ! -f "$BACKUP_PATH" ]]; then
  printf '用法：%s /path/to/original-app.asar [/path/to/installed-app.asar]\n' "$0" >&2
  exit 2
fi
if [[ ! -f "$ASAR_PATH" ]]; then
  printf '目标 app.asar 不存在：%s\n' "$ASAR_PATH" >&2
  exit 1
fi
if pgrep -x ChatGPT >/dev/null 2>&1; then
  printf 'ChatGPT/Codex 正在运行。请先正常退出应用；本脚本不会替你重启。\n' >&2
  exit 1
fi

NODE_BIN=$(command -v node || true)
if [[ -z "$NODE_BIN" && -x "$(dirname -- "$ASAR_PATH")/cua_node/bin/node" ]]; then
  NODE_BIN="$(dirname -- "$ASAR_PATH")/cua_node/bin/node"
fi
if [[ -z "$NODE_BIN" ]]; then
  printf '需要 Node.js 验证备份。\n' >&2
  exit 1
fi

BACKUP_STATUS=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$BACKUP_PATH" | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).status))')
if [[ "$BACKUP_STATUS" != "official-supported" ]]; then
  printf '拒绝恢复：备份不是受支持的官方原始版本，状态为 %s。\n' "$BACKUP_STATUS" >&2
  exit 1
fi

if [[ -w "$ASAR_PATH" ]]; then
  install -m 0644 "$BACKUP_PATH" "$ASAR_PATH"
elif command -v sudo >/dev/null 2>&1; then
  sudo install -m 0644 "$BACKUP_PATH" "$ASAR_PATH"
else
  printf '需要管理员权限写入 %s，但系统没有 sudo。\n' "$ASAR_PATH" >&2
  exit 1
fi

"$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH"
printf '运行时已恢复。脚本没有启动或重启应用。\n'
