#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CODEX_DATA_DIR=${CODEX_HOME:-"$HOME/.codex"}
TARGET_DIR="$CODEX_DATA_DIR/pets/xiaoleimi"

mkdir -p "$TARGET_DIR"
install -m 0644 "$SCRIPT_DIR/pet.json" "$TARGET_DIR/pet.json"
install -m 0644 "$SCRIPT_DIR/spritesheet.webp" "$TARGET_DIR/spritesheet.webp"

printf 'Installed Xiaoleimi to %s\n' "$TARGET_DIR"
printf 'Open Settings > Pets, choose Refresh, then select 小蕾米.\n'
