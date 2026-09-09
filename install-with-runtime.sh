#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source "$SCRIPT_DIR/scripts/runtime-common.sh"
resolve_runtime "${1:-}"
INSPECTION=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH")
STATUS=$(json_field "$INSPECTION" status)
VERSION=$(json_field "$INSPECTION" appVersion)
printf '%s\n' "$INSPECTION"
if [[ "$STATUS" != official-supported && "$STATUS" != patched ]]; then
  printf '未适配此版本或文件指纹不匹配；未修改客户端。可独立运行 ./install.sh 使用标准动作。\n' >&2
  exit 2
fi
if [[ "$STATUS" == patched ]]; then
  "$SCRIPT_DIR/install.sh"
  printf '运行时已匹配受支持补丁，无需重复修改。\n'
  exit 0
fi
require_closed
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/xiaoleimi-runtime.XXXXXX")
trap 'rm -rf -- "$WORK_DIR"' EXIT
ORIGINAL_SHA=$(sha256sum "$ASAR_PATH" | awk '{print $1}')
"$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" apply "$ASAR_PATH" "$WORK_DIR/app.asar" > "$WORK_DIR/inspection.json"
PATCHED_SHA=$(sha256sum "$WORK_DIR/app.asar" | awk '{print $1}')
BACKUP_DIR="${CODEX_HOME:-$HOME/.codex}/pet-runtime-backups"
mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$BACKUP_DIR/app.asar.$VERSION.$ORIGINAL_SHA"
if [[ ! -f "$BACKUP_PATH" ]]; then
  install -m 0600 "$ASAR_PATH" "$BACKUP_PATH"
fi
[[ $(sha256sum "$BACKUP_PATH" | awk '{print $1}') == "$ORIGINAL_SHA" ]] || { echo '备份校验失败' >&2; exit 1; }
# The pair pins rollback to this complete installation, not just matching pet chunks.
"$NODE_BIN" -e 'const fs=require("fs");const [p,v,b,a,t]=process.argv.slice(1);fs.writeFileSync(p,JSON.stringify({version:v,originalSha256:b,patchedSha256:a,target:t},null,2)+"\n",{mode:0o600})' "$BACKUP_PATH.json" "$VERSION" "$ORIGINAL_SHA" "$PATCHED_SHA" "$ASAR_PATH"
"$SCRIPT_DIR/install.sh"
require_closed
[[ $(sha256sum "$ASAR_PATH" | awk '{print $1}') == "$ORIGINAL_SHA" ]] || { echo '客户端在准备期间发生变化，停止安装' >&2; exit 1; }
atomic_replace "$WORK_DIR/app.asar"
[[ $(sha256sum "$ASAR_PATH" | awk '{print $1}') == "$PATCHED_SHA" ]] || { echo "安装后校验失败，备份：$BACKUP_PATH" >&2; exit 1; }
"$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH"
printf '已安装动作映射。备份：%s\n版本：%s；请手动打开客户端并完成动作验收。\n' "$BACKUP_PATH" "$VERSION"
