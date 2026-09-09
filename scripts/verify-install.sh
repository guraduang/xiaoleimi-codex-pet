#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$SCRIPT_DIR/scripts/runtime-common.sh"
PET_DIR="${CODEX_HOME:-$HOME/.codex}/pets/xiaoleimi"
if ! cmp -s "$SCRIPT_DIR/pet.json" "$PET_DIR/pet.json" || ! cmp -s "$SCRIPT_DIR/spritesheet.webp" "$PET_DIR/spritesheet.webp"; then
  echo "pet=missing-or-different path=$PET_DIR"; exit 1
fi
echo "pet=ok path=$PET_DIR"
if [[ -f "${CODEX_HOME:-$HOME/.codex}/config.toml" ]] && grep -Fq 'selected-avatar-id = "custom:xiaoleimi"' "${CODEX_HOME:-$HOME/.codex}/config.toml"; then
  echo 'selection=ok value=custom:xiaoleimi'
else
  echo 'selection=not-confirmed action=Settings-Pets-Refresh-小蕾米'
fi
resolve_runtime "${1:-}" || { echo 'runtime=unknown'; exit 2; }
INSPECTION=$("$NODE_BIN" "$SCRIPT_DIR/scripts/runtime-patch.js" inspect "$ASAR_PATH")
printf '%s\n' "$INSPECTION"
case $(json_field "$INSPECTION" status) in
  patched) echo 'runtime=patched action=restart-and-visually-verify';;
  official-supported) echo 'runtime=not-installed-or-overwritten action=close-app-and-run-install-with-runtime'; exit 3;;
  *) echo 'runtime=unsupported action=use-standard-pet-and-adapt-new-version'; exit 2;;
esac
