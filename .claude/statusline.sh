#!/usr/bin/env bash
# Project status line (needs jq). Two lines: model/effort/timer/lines, then usage bars + git.
in=$(cat)
j() { jq -r "$1 // empty" <<<"$in"; }
dir=$(j '.workspace.current_dir'); dir=${dir:-.}

# green < 60, amber < 85, red above
color() { if [ "$1" -ge 85 ]; then printf '\033[31m'; elif [ "$1" -ge 60 ]; then printf '\033[33m'; else printf '\033[32m'; fi; }
bar() { local f=$(( $1 / 10 )) i b=; for ((i=0;i<10;i++)); do [ $i -lt $f ] && b+=▓ || b+=░; done; printf '%s' "$b"; }
# seconds -> "1h20m" / "3d4h"
dur() {
  local s=$1
  if [ "$s" -ge 86400 ]; then printf '%dd%dh' $((s/86400)) $((s%86400/3600))
  elif [ "$s" -ge 3600 ]; then printf '%dh%02dm' $((s/3600)) $((s%3600/60))
  else printf '%dm' $((s/60)); fi
}
# metric ICON LABEL PCT [RESETS_AT]
metric() {
  local r left
  line2="$line2$sep$1 $(color "$3")$(bar "$3") $3% $2\033[0m"
  if [ -n "$4" ]; then left=$(( $4 - $(date +%s) )); [ "$left" -gt 0 ] && line2="$line2 · resets $(dur "$left")"; fi
}

# line 1
line1="🤖 $(j '.model.display_name') ($(j '.effort.level'))"
ms=$(j '.cost.total_duration_ms'); [ -n "$ms" ] && line1="$line1 │ ⏱ $(dur $((ms/1000)))"
add=$(j '.cost.total_lines_added'); del=$(j '.cost.total_lines_removed')
[ -n "$add" ] && line1="$line1 │ \033[32m+$add\033[0m \033[31m-$del\033[0m"
line1="$line1 │ 📁 $(basename "$(j '.workspace.project_dir')")"

# line 2
sep=; line2=
pct=$(jq -r '.context_window.used_percentage // 0 | floor' <<<"$in")
metric 📊 ctx "$pct"; sep=' │ '
for w in "five_hour ⏳ session" "seven_day 📅 week"; do
  set -- $w
  p=$(jq -r ".rate_limits.$1.used_percentage // empty | floor" <<<"$in")
  [ -n "$p" ] && metric "$2" "$3" "$p" "$(j ".rate_limits.$1.resets_at")"
done

branch=$(git -C "$dir" branch --show-current 2>/dev/null)
[ -z "$branch" ] && branch=$(git -C "$dir" rev-parse --short HEAD 2>/dev/null)
if [ -n "$branch" ]; then
  st=$(git -C "$dir" status --porcelain 2>/dev/null)
  staged=$(grep -c '^[AMDR]' <<<"$st"); mod=$(grep -c '^.[MD]' <<<"$st")
  g="🌿 $branch"
  [ "$staged" -gt 0 ] && g="$g +$staged"
  [ "$mod" -gt 0 ] && g="$g ~$mod"
  ab=$(git -C "$dir" rev-list --left-right --count '@{u}...HEAD' 2>/dev/null) && g="$g ↑${ab#*$'\t'} ↓${ab%$'\t'*}"
  line2="$line2$sep$g"
fi
printf '%b\n%b\n' "$line1" "$line2"
