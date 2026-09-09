#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$SCRIPT_DIR/scripts/runtime-common.sh"
BACKUP_PATH=${1:-}
[[ -n "$BACKUP_PATH" && -f "$BACKUP_PATH" && -f "$BACKUP_PATH.json" ]] || { echo '用法：restore-runtime.sh /path/to/backup.asar [app.asar]；需要配套 .json 回滚记录。' >&2; exit 2; }
resolve_runtime "${2:-}"
require_closed
META=$(cat "$BACKUP_PATH.json")
[[ $(json_field "$META" target) == "$ASAR_PATH" ]] || { echo '拒绝恢复到不同安装路径' >&2; exit 2; }
ORIGINAL_SHA=$(json_field "$META" originalSha256)
PATCHED_SHA=$(json_field "$META" patchedSha256)
[[ $(sha256sum "$BACKUP_PATH" | awk '{print $1}') == "$ORIGINAL_SHA" ]] || { echo '备份完整校验失败' >&2; exit 2; }
[[ $(sha256sum "$ASAR_PATH" | awk '{print $1}') == "$PATCHED_SHA" ]] || { echo '客户端已更新或被其他修改改变；拒绝用旧备份覆盖。请使用当前版本官方安装包恢复。' >&2; exit 2; }
INSPECTION=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$BACKUP_PATH")
[[ $(json_field "$INSPECTION" status) == official-supported && $(json_field "$INSPECTION" appVersion) == "$(json_field "$META" version)" ]] || { echo '备份版本/模块不匹配' >&2; exit 2; }
atomic_replace "$BACKUP_PATH"
[[ $(sha256sum "$ASAR_PATH" | awk '{print $1}') == "$ORIGINAL_SHA" ]] || { echo '恢复后校验失败' >&2; exit 1; }
echo '已恢复原始运行时；素材保留，请手动打开客户端。'
