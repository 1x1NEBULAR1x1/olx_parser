#!/bin/zsh
# Двойной клик → меню: проверка обновлений / пересборка / запуск.
set -euo pipefail

_olx_resolve() {
  local src="$1"
  while [[ -L "$src" ]]; do
    local dir="${src:h}"
    local next
    next="$(readlink "$src")"
    if [[ "$next" != /* ]]; then
      src="$dir/$next"
    else
      src="$next"
    fi
  done
  printf '%s\n' "$src"
}

THIS="$(_olx_resolve "$0")"
ROOT="$(cd "$(dirname "$THIS")/.." && pwd)"

if [[ ! -d "$ROOT" ]]; then
  echo "Папка проекта не найдена."
  echo "Нажми Enter, чтобы закрыть окно."
  read -r || true
  exit 1
fi

[[ -f "$HOME/.zprofile" ]] && source "$HOME/.zprofile"

cd "$ROOT"
source "$ROOT/scripts/mac.sh"
olx_menu

echo
echo "Нажми Enter, чтобы закрыть окно."
read -r || true
