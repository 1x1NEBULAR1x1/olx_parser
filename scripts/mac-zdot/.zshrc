# Если окно открыли через старый ZDOTDIR-ярлык — сразу меню цифрами.
if [[ -f "$HOME/.zprofile" ]]; then
  source "$HOME/.zprofile"
fi
if [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi

cd "${OLX_PROJECT_ROOT:-$HOME/Desktop/olx_parser-main}" || {
  print -u2 "Не найдена папка проекта"
  return
}

source "${OLX_PROJECT_ROOT:-.}/scripts/mac.sh"
olx_menu
exit
