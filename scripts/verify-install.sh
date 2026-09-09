#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CODEX_DATA_DIR=${CODEX_HOME:-"$HOME/.codex"}
PET_DIR="$CODEX_DATA_DIR/pets/xiaoleimi"
ASAR_PATH=${CHATGPT_ASAR_PATH:-${1:-/usr/lib/chatgpt/resources/app.asar}}

if [[ ! -f "$PET_DIR/pet.json" || ! -f "$PET_DIR/spritesheet.webp" ]]; then
  printf 'pet=missing path=%s\n' "$PET_DIR"
  exit 1
fi

cmp -s "$SCRIPT_DIR/pet.json" "$PET_DIR/pet.json"
cmp -s "$SCRIPT_DIR/spritesheet.webp" "$PET_DIR/spritesheet.webp"
printf 'pet=ok id=xiaoleimi path=%s\n' "$PET_DIR"

if [[ -f "$ASAR_PATH" ]]; then
  NODE_BIN=$(command -v node || true)
  if [[ -z "$NODE_BIN" && -x "$(dirname -- "$ASAR_PATH")/cua_node/bin/node" ]]; then
    NODE_BIN="$(dirname -- "$ASAR_PATH")/cua_node/bin/node"
  fi
  if [[ -z "$NODE_BIN" ]]; then
    printf 'runtime=unknown reason=node-missing\n'
    exit 1
  fi
  "$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH"
else
  printf 'runtime=not-checked reason=app-asar-not-found path=%s\n' "$ASAR_PATH"
fi

if [[ -f "$CODEX_DATA_DIR/config.toml" ]] && grep -Fq 'selected-avatar-id = "custom:xiaoleimi"' "$CODEX_DATA_DIR/config.toml"; then
  printf 'selection=ok value=custom:xiaoleimi\n'
else
  printf 'selection=not-selected action="Settings > Pets > Refresh > 小蕾米"\n'
fi
