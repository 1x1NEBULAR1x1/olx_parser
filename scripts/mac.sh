#!/usr/bin/env bash
# SmartFlip / olx_parser — три команды для Mac-консоли.
#
# Интерактивная консоль (двойной клик с рабочего стола):
#   scripts/mac-console.command
#   или ярлык ~/Desktop/SmartFlip.command
#
# Подключить в уже открытый шелл:
#   source scripts/mac.sh
#
# Репозиторий: https://github.com/1x1NEBULAR1x1/olx_parser

_olx_script_path() {
  if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    printf '%s\n' "${BASH_SOURCE[0]}"
    return
  fi
  if [[ -n "${ZSH_VERSION:-}" ]]; then
    # shellcheck disable=SC2296
    printf '%s\n' "${(%):-%x}"
    return
  fi
  printf '%s\n' "$0"
}

OLX_ROOT="$(cd "$(dirname "$(_olx_script_path)")/.." && pwd)"
OLX_GITHUB_HTTPS="https://github.com/1x1NEBULAR1x1/olx_parser"
OLX_GITHUB_SSH="git@github.com:1x1NEBULAR1x1/olx_parser.git"
OLX_GITHUB_OWNER="1x1NEBULAR1x1"
OLX_GITHUB_REPO="olx_parser"
OLX_APP_PORT="${PORT:-8080}"
OLX_APP_HOST="${APP_BIND_HOST:-127.0.0.1}"
OLX_PID_FILE="${OLX_ROOT}/.olx-mac.pid"
OLX_LOG_FILE="${OLX_ROOT}/.olx-mac.log"

if [[ -t 1 ]]; then
  OLX_C_RESET=$'\033[0m'
  OLX_C_BOLD=$'\033[1m'
  OLX_C_DIM=$'\033[2m'
  OLX_C_GREEN=$'\033[32m'
  OLX_C_YELLOW=$'\033[33m'
  OLX_C_RED=$'\033[31m'
  OLX_C_CYAN=$'\033[36m'
else
  OLX_C_RESET="" OLX_C_BOLD="" OLX_C_DIM=""
  OLX_C_GREEN="" OLX_C_YELLOW="" OLX_C_RED="" OLX_C_CYAN=""
fi

_olx_info()  { printf '%s==>%s %s\n' "$OLX_C_CYAN" "$OLX_C_RESET" "$*"; }
_olx_ok()    { printf '%sOK%s   %s\n' "$OLX_C_GREEN" "$OLX_C_RESET" "$*"; }
_olx_warn()  { printf '%sWARN%s %s\n' "$OLX_C_YELLOW" "$OLX_C_RESET" "$*"; }
_olx_err()   { printf '%sERR%s  %s\n' "$OLX_C_RED" "$OLX_C_RESET" "$*" >&2; }

_olx_cd() { cd "$OLX_ROOT"; }

_olx_require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    _olx_err "не найдена команда: $name"
    return 1
  fi
}

_olx_git_ssh_cmd() {
  if [[ -n "${OLX_SSH_KEY:-}" && -f "$OLX_SSH_KEY" ]]; then
    printf 'ssh -i %q -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=12' "$OLX_SSH_KEY"
    return
  fi
  printf 'ssh -o BatchMode=yes -o ConnectTimeout=12'
}

_olx_git() {
  GIT_SSH_COMMAND="$(_olx_git_ssh_cmd)" git "$@"
}

_olx_require_node() {
  _olx_require_cmd node
  _olx_require_cmd npm
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if (( major < 22 )); then
    _olx_err "нужен Node >= 22, сейчас $(node -v)"
    return 1
  fi
}

_olx_ensure_env() {
  if [[ ! -f "$OLX_ROOT/.env" ]]; then
    if [[ -f "$OLX_ROOT/.env.example" ]]; then
      cp "$OLX_ROOT/.env.example" "$OLX_ROOT/.env"
      _olx_warn "создан .env из .env.example — проверь секреты"
    else
      _olx_err "нет .env и нет .env.example"
      return 1
    fi
  fi
}

_olx_warn_if_root_modules() {
  if [[ -d "$OLX_ROOT/node_modules" ]]; then
    local owner
    owner="$(stat -f '%Su' "$OLX_ROOT/node_modules" 2>/dev/null || true)"
    if [[ "$owner" == "root" ]]; then
      _olx_err "node_modules принадлежит root (ставили через sudo). Не используй sudo с npm/pnpm."
      _olx_err "исправь в Терминале: sudo chown -R \"\$(whoami):staff\" \"$OLX_ROOT/node_modules\""
      return 1
    fi
  fi
}

_olx_install_deps() {
  _olx_warn_if_root_modules
  if [[ -f "$OLX_ROOT/pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
    _olx_info "pnpm install..."
    pnpm install
  else
    _olx_info "npm ci..."
    npm ci
  fi
}

_olx_ensure_git_repo() {
  if [[ -d "$OLX_ROOT/.git" ]]; then
    return 0
  fi
  _olx_info "папка ещё не git-репозиторий — инициализирую и цепляю origin"
  git init -b main
  git remote add origin "$OLX_GITHUB_SSH"
  _olx_ok "git init + remote origin → $OLX_GITHUB_SSH"
}

_olx_ensure_origin() {
  local url
  if git remote get-url origin >/dev/null 2>&1; then
    url="$(git remote get-url origin)"
    if [[ "$url" != *"$OLX_GITHUB_OWNER/$OLX_GITHUB_REPO"* ]]; then
      _olx_warn "origin сейчас: $url"
      _olx_warn "ожидался: $OLX_GITHUB_SSH"
    fi
    return 0
  fi
  git remote add origin "$OLX_GITHUB_SSH"
  _olx_ok "добавлен origin → $OLX_GITHUB_SSH"
}

_olx_default_branch() {
  local ref
  ref="$(_olx_git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ {print $2}')"
  if [[ "$ref" == refs/heads/* ]]; then
    printf '%s\n' "${ref#refs/heads/}"
    return
  fi
  printf 'main\n'
}

_olx_local_sha() {
  git rev-parse --quiet --verify HEAD 2>/dev/null || true
}

_olx_stop_port() {
  local pids
  pids="$(lsof -nP -iTCP:"$OLX_APP_PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  _olx_info "останавливаю процесс на порту $OLX_APP_PORT ($pids)"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(lsof -nP -iTCP:"$OLX_APP_PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

_olx_wait_health() {
  local i url="http://${OLX_APP_HOST}:${OLX_APP_PORT}/api/health"
  for i in {1..30}; do
    if curl -sf "$url" >/dev/null 2>&1; then
      _olx_ok "health: $url"
      curl -sf "$url"
      printf '\n'
      return 0
    fi
    sleep 1
  done
  _olx_err "сервер не ответил за 30с: $url"
  return 1
}

_olx_local_url() {
  printf 'http://127.0.0.1:%s\n' "$OLX_APP_PORT"
}

_olx_open_browser() {
  local url="$1"
  _olx_info "открываю браузер: $url"
  open "$url" 2>/dev/null || true
}

_olx_stop_all() {
  _olx_stop_port
  rm -f "$OLX_PID_FILE"
}

###############################################################################
# 1) проверка доступа к GitHub + обновления
###############################################################################
olx_check() (
  set -euo pipefail
  _olx_cd
  _olx_require_cmd git
  _olx_require_cmd ssh

  local mode="${1:-}"
  local do_pull=0
  local do_force=0
  if [[ "$mode" == "pull" ]]; then
    do_pull=1
    if [[ "${2:-}" == "--force" || "${2:-}" == "-f" ]]; then
      do_force=1
    fi
  fi

  printf '\n%s[1/3] GitHub%s  %s\n' "$OLX_C_BOLD" "$OLX_C_RESET" "$OLX_GITHUB_HTTPS"

  _olx_info "проверка SSH к github.com..."
  local ssh_out ssh_code=0
  ssh_out="$(ssh -o BatchMode=yes -o ConnectTimeout=12 -T git@github.com 2>&1)" || ssh_code=$?
  if printf '%s' "$ssh_out" | grep -qi 'successfully authenticated'; then
    _olx_ok "SSH: $ssh_out"
  else
    _olx_err "нет SSH-доступа к github.com (код $ssh_code)"
    printf '%s\n' "$ssh_out"
    _olx_warn "ключ в ~/.ssh/config → IdentityFile ~/.ssh/id_rsa_github"
    return 1
  fi

  _olx_info "проверка доступа к $OLX_GITHUB_OWNER/$OLX_GITHUB_REPO..."
  local remote_head
  if ! remote_head="$(_olx_git ls-remote "$OLX_GITHUB_SSH" HEAD | awk '{print $1}')"; then
    _olx_err "git ls-remote не удался — репозиторий недоступен или нет прав"
    return 1
  fi
  if [[ -z "$remote_head" ]]; then
    _olx_err "пустой ответ ls-remote"
    return 1
  fi
  _olx_ok "доступ есть, origin HEAD = ${remote_head:0:12}"

  _olx_ensure_git_repo
  _olx_ensure_origin

  _olx_info "fetch origin..."
  _olx_git fetch origin --prune

  local branch local_sha remote_sha
  branch="$(_olx_default_branch)"
  local_sha="$(_olx_local_sha)"
  remote_sha="$(_olx_git rev-parse "origin/${branch}" 2>/dev/null || true)"

  printf '%sветка%s   origin/%s\n' "$OLX_C_DIM" "$OLX_C_RESET" "$branch"
  if [[ -n "$local_sha" ]]; then
    printf '%sлокально%s %s\n' "$OLX_C_DIM" "$OLX_C_RESET" "${local_sha:0:12}"
  else
    printf '%sлокально%s нет коммитов (папка была без .git)\n' "$OLX_C_DIM" "$OLX_C_RESET"
  fi
  printf '%sGitHub%s   %s\n' "$OLX_C_DIM" "$OLX_C_RESET" "${remote_sha:0:12}"

  if [[ -z "$local_sha" ]]; then
    _olx_warn "локально нет истории — чтобы взять код с GitHub: olx_check pull"
  elif [[ "$local_sha" == "$remote_sha" ]]; then
    _olx_ok "уже актуально, обновлений нет"
    [[ "$do_pull" -eq 1 ]] && _olx_info "pull не нужен"
    return 0
  else
    local behind ahead
    behind="$(git rev-list --count "${local_sha}..origin/${branch}" 2>/dev/null || echo "?")"
    ahead="$(git rev-list --count "origin/${branch}..${local_sha}" 2>/dev/null || echo "?")"
    _olx_warn "есть обновления: отстаём на $behind, своих коммитов $ahead"
    git --no-pager log --oneline "${local_sha}..origin/${branch}" 2>/dev/null | /usr/bin/sed -n '1,12p' || true
  fi

  if [[ "$do_pull" -ne 1 ]]; then
    printf '%sподтянуть:%s olx_check pull\n' "$OLX_C_DIM" "$OLX_C_RESET"
    return 0
  fi

  _olx_info "подтягиваю origin/${branch}..."
  if [[ -z "$local_sha" ]]; then
    if [[ "$do_force" -eq 1 ]]; then
      git checkout -f -B "$branch" "origin/${branch}"
    else
      git checkout -B "$branch" "origin/${branch}"
    fi
  else
    if [[ "$do_force" -eq 1 ]]; then
      git reset --hard "origin/${branch}"
    else
      git pull --ff-only origin "$branch"
    fi
  fi
  _olx_ok "код синхронизирован с origin/${branch} ($(git rev-parse --short HEAD))"
)

###############################################################################
# 2) пересборка
###############################################################################
olx_build() (
  set -euo pipefail
  _olx_cd
  _olx_require_node
  _olx_ensure_env
  _olx_warn_if_root_modules

  printf '\n%s[2/3] Сборка%s  %s\n' "$OLX_C_BOLD" "$OLX_C_RESET" "$OLX_ROOT"
  _olx_info "Node $(node -v), npm $(npm -v), arch $(uname -m)"

  _olx_install_deps

  _olx_info "prisma generate + migrate deploy..."
  npx prisma generate
  npx prisma migrate deploy

  if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    _olx_warn "better-sqlite3 не грузится — npm rebuild"
    npm rebuild better-sqlite3
    node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
  else
    _olx_ok "better-sqlite3 загружается"
  fi

  _olx_info "next build..."
  npm run build:next
  _olx_ok "сборка готова. запуск: olx_run"
)

###############################################################################
# 3) запуск + вкладка браузера (localhost — Google OAuth)
###############################################################################
olx_run() (
  set -euo pipefail
  _olx_cd
  _olx_require_node
  _olx_ensure_env

  local mode="${1:-open}"
  local local_url
  local_url="$(_olx_local_url)"

  printf '\n%s[3/3] Запуск%s  %s\n' "$OLX_C_BOLD" "$OLX_C_RESET" "$local_url"

  _olx_stop_all

  if [[ "$mode" == "dev" ]]; then
    _olx_info "режим разработки..."
    nohup npm run dev >"$OLX_LOG_FILE" 2>&1 &
    echo $! >"$OLX_PID_FILE"
  else
    if [[ ! -d .next ]]; then
      _olx_warn "сборки ещё нет — сначала соберу"
      olx_build
    fi
    _olx_info "запускаю сайт..."
    nohup npm run start >"$OLX_LOG_FILE" 2>&1 &
    echo $! >"$OLX_PID_FILE"
  fi

  _olx_wait_health
  _olx_open_browser "$local_url"

  echo
  echo "Сайт: $local_url"
  echo "Вход через Google работает здесь, на localhost."
  echo "Остановка — Control+C"
  echo

  trap '_olx_stop_all; echo; echo "Сайт выключен."; exit 0' INT TERM
  while true; do
    if ! kill -0 "$(cat "$OLX_PID_FILE" 2>/dev/null)" 2>/dev/null; then
      if ! lsof -nP -iTCP:"$OLX_APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        _olx_err "процесс сайта остановился. Лог: $OLX_LOG_FILE"
        _olx_stop_all
        return 1
      fi
    fi
    sleep 2
  done
)

_olx_ask_yes() {
  local answer
  printf '%s [д/н]: ' "$1"
  read -r answer || return 1
  case "$answer" in
    д|Д|y|Y|да|Да|yes|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

_olx_offer_pull_if_needed() {
  _olx_cd
  local branch local_sha remote_sha
  branch="$(_olx_default_branch 2>/dev/null || echo main)"
  local_sha="$(_olx_local_sha)"
  remote_sha="$(git rev-parse "origin/${branch}" 2>/dev/null || true)"
  if [[ -z "$remote_sha" ]]; then
    return 0
  fi
  if [[ -z "$local_sha" || "$local_sha" != "$remote_sha" ]]; then
    echo
    echo "На GitHub есть более новая версия."
    if _olx_ask_yes "Скачать её сейчас?"; then
      olx_check pull || true
    else
      echo "Ок, код не трогаю."
    fi
  fi
}

olx_menu() {
  _olx_cd
  while true; do
    printf '\n'
    printf '%sSmartFlip%s\n' "$OLX_C_BOLD" "$OLX_C_RESET"
    printf 'Что сделать?\n\n'
    printf '  %s1%s  Проверка обновлений — есть ли новый код на GitHub\n' "$OLX_C_CYAN" "$OLX_C_RESET"
    printf '  %s2%s  Пересборка — заново собрать приложение\n' "$OLX_C_CYAN" "$OLX_C_RESET"
    printf '  %s3%s  Запуск — включить сайт и открыть вкладку в браузере\n' "$OLX_C_CYAN" "$OLX_C_RESET"
    printf '  %s0%s  Выход\n\n' "$OLX_C_DIM" "$OLX_C_RESET"
    printf 'Введи цифру: '
    local choice
    read -r choice || break
    case "$choice" in
      1)
        olx_check || true
        _olx_offer_pull_if_needed
        ;;
      2)
        olx_build || echo "Пересборка не удалась."
        ;;
      3)
        echo
        echo "Включу сайт и открою вкладку в браузере."
        echo
        olx_run || true
        ;;
      0)
        echo "Пока."
        break
        ;;
      *)
        echo "Нужна цифра 1, 2 или 3 (0 — выйти)."
        ;;
    esac
  done
}

olx_help() {
  olx_menu
}

_olx_is_sourced() {
  if [[ -n "${ZSH_VERSION:-}" ]]; then
    [[ "${ZSH_EVAL_CONTEXT:-}" == *:file* ]]
    return
  fi
  if [[ -n "${BASH_VERSION:-}" ]]; then
    [[ "${BASH_SOURCE[0]}" != "$0" ]]
    return
  fi
  return 1
}

if _olx_is_sourced; then
  :
else
  set -euo pipefail
  case "${1:-menu}" in
    check|update) shift; olx_check "$@" ;;
    build|rebuild) shift; olx_build "$@" ;;
    run|start) shift; olx_run "$@" ;;
    menu|help|-h|--help) olx_menu ;;
    *)
      _olx_err "неизвестная команда: ${1:-}"
      olx_menu
      ;;
  esac
fi
