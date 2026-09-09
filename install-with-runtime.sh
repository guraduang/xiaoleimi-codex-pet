#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CODEX_DATA_DIR=${CODEX_HOME:-"$HOME/.codex"}
ASAR_PATH=${CHATGPT_ASAR_PATH:-${1:-}}

find_asar() {
  local candidate
  for candidate in \
    /usr/lib/chatgpt/resources/app.asar \
    /usr/lib64/chatgpt/resources/app.asar \
    /opt/chatgpt/resources/app.asar \
    /opt/ChatGPT/resources/app.asar
  do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ -z "$ASAR_PATH" ]]; then
  ASAR_PATH=$(find_asar || true)
fi
if [[ -z "$ASAR_PATH" || ! -f "$ASAR_PATH" ]]; then
  printf '找不到 app.asar。请设置 CHATGPT_ASAR_PATH，或把路径作为第一个参数传入。\n' >&2
  exit 1
fi

NODE_BIN=$(command -v node || true)
if [[ -z "$NODE_BIN" && -x "$(dirname -- "$ASAR_PATH")/cua_node/bin/node" ]]; then
  NODE_BIN="$(dirname -- "$ASAR_PATH")/cua_node/bin/node"
fi
if [[ -z "$NODE_BIN" ]]; then
  printf '需要 Node.js 来安全读取和修改 ASAR。\n' >&2
  exit 1
fi

INSPECTION=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH")
STATUS=$(printf '%s' "$INSPECTION" | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).status))')

if [[ "$STATUS" == "unsupported-or-mixed" ]]; then
  printf '%s\n' "$INSPECTION" >&2
  printf '当前客户端版本或模块指纹不受支持；没有写入任何文件。\n' >&2
  exit 1
fi

if pgrep -x ChatGPT >/dev/null 2>&1; then
  printf 'ChatGPT/Codex 正在运行。请先正常退出应用，再重新执行；本脚本不会替你重启。\n' >&2
  exit 1
fi

"$SCRIPT_DIR/install.sh"

if [[ "$STATUS" == "patched" ]]; then
  printf '运行时已经包含 Xiaoleimi 映射，无需重复修改。\n'
  exit 0
fi

BACKUP_DIR="$CODEX_DATA_DIR/pet-runtime-backups"
mkdir -p "$BACKUP_DIR"
ORIGINAL_SHA=$(sha256sum "$ASAR_PATH" | awk '{print $1}')
BACKUP_PATH="$BACKUP_DIR/app.asar.26.814.41407.$ORIGINAL_SHA"
if [[ ! -f "$BACKUP_PATH" ]]; then
  install -m 0644 "$ASAR_PATH" "$BACKUP_PATH"
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/xiaoleimi-runtime.XXXXXX")
cleanup() {
  if [[ -d "$WORK_DIR" ]]; then
    find "$WORK_DIR" -depth -delete
  fi
}
trap cleanup EXIT

PATCHED_ASAR="$WORK_DIR/app.asar"
"$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" apply "$ASAR_PATH" "$PATCHED_ASAR" >/dev/null

if [[ -w "$ASAR_PATH" ]]; then
  install -m 0644 "$PATCHED_ASAR" "$ASAR_PATH"
elif command -v sudo >/dev/null 2>&1; then
  sudo install -m 0644 "$PATCHED_ASAR" "$ASAR_PATH"
else
  printf '需要管理员权限写入 %s，但系统没有 sudo。\n' "$ASAR_PATH" >&2
  exit 1
fi

FINAL_STATUS=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH" | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).status))')
if [[ "$FINAL_STATUS" != "patched" ]]; then
  printf '安装后验证失败。原始备份位于：%s\n' "$BACKUP_PATH" >&2
  exit 1
fi

printf 'Xiaoleimi 素材和运行时映射已经安装。\n'
printf '原始 app.asar 备份：%s\n' "$BACKUP_PATH"
printf '脚本没有启动或重启应用；请在方便时手动打开 ChatGPT/Codex。\n'
