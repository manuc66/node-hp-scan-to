#!/bin/bash
# drive-installer.sh — drive the interactive HP webpack installer under Wine.
#
# The HP driver "webpack" (Full_Webpack-*.exe) extracts and runs an
# interactive installer (hp-dqex5.exe) whose screens are rendered by a
# WebView control. This script launches it in the isolated container and
# drives the screens by OCR (tesseract) + clicks (xdotool):
#   - "Let's get started"                      -> click "Continue"
#   - "Installation Agreements and Settings"   -> check "I have reviewed and
#     accept..." then click "Accept"
#
# All X11 operations run INSIDE the container (its Xvfb :99 display).
#
# Usage:
#   drive-installer.sh <webpack-exe> [container]
#
# Examples:
#   drive-installer.sh "/downloads/Full_Webpack-50.2.4593_1-ST570_Full_Webpack.exe"
#   drive-installer.sh "/path/to/webpack.exe" wine-capture-test
set -euo pipefail

WEBPACK="${1:?usage: drive-installer.sh <webpack-exe> [container]}"
C="${2:-wine-capture-test}"

# Run a shell snippet inside the container (X11 tools live there).
xsh() { docker exec "$C" bash -c "$1"; }

# --- helpers --------------------------------------------------------------

# Wait for a visible window whose name matches a regex; echo the window id.
wait_window() {
  local name_re="$1" tries="${2:-90}"
  for _ in $(seq 1 "$tries"); do
    # xdotool may return stale ids; accept only ids that resolve to a
    # live window with the expected name.
    local id
    id=$(xsh "timeout 3 env DISPLAY=:99 xdotool search --onlyvisible --name '$name_re' 2>/dev/null | head -1" || true)
    if [ -n "$id" ]; then
      local ok
      ok=$(xsh "timeout 3 env DISPLAY=:99 xdotool getwindowname $id 2>/dev/null" || true)
      if [ -n "$ok" ]; then
        echo "$id"
        return 0
      fi
    fi
    sleep 1
  done
  echo "error: window '$name_re' not found" >&2
  return 1
}

# Screenshot a window id to a png (inside the container).
shot() {
  local id="$1" out="$2"
  xsh "timeout 5 env DISPLAY=:99 import -window $id $out 2>/dev/null \
       || timeout 5 env DISPLAY=:99 xwd -id $id 2>/dev/null | convert xwd:- $out 2>/dev/null \
       || exit 1"
}

# Find the window-relative coordinates of a text word via tesseract TSV.
# With pick=last it returns the bottom-most occurrence (e.g. the real
# "Accept" button rather than an earlier label). Echoes "X Y".
find_text() {
  local png="$1" word="$2" scale="${3:-2}" pick="${4:-first}"
  local big="/tmp/find_text_$$.png"
  xsh "convert $png -colorspace gray -resize ${scale}00% -sharpen 0x1 $big 2>/dev/null
       tesseract $big stdout --psm 11 tsv 2>/dev/null \
         | awk -F'\t' -v w='$word' 'tolower(\$12)==tolower(w) { print }' \
         | { if [ '$pick' = 'last' ]; then tail -1; else head -1; fi }" >/tmp/ocr_line.$$ 
  local line; line=$(cat /tmp/ocr_line.$$); rm -f /tmp/ocr_line.$$
  if [ -z "$line" ]; then
    xsh "rm -f $big"
    return 1
  fi
  local left top width height
  left=$(echo "$line" | cut -f7)
  top=$(echo "$line" | cut -f8)
  width=$(echo "$line" | cut -f9)
  height=$(echo "$line" | cut -f10)
  local x y
  x=$(( (left + width / 2) / scale ))
  y=$(( (top + height / 2) / scale ))
  xsh "rm -f $big"
  echo "$x $y"
}

# Click at an absolute screen coordinate (inside the container).
click() {
  local x="$1" y="$2"
  xsh "timeout 3 env DISPLAY=:99 xdotool mousemove $x $y click 1 2>/dev/null || exit 1"
  sleep 1
}

# Re-discover the live window id matching the installer name (ids change
# between runs / screens).
find_installer_window() {
  local id
  id=$(xsh "timeout 3 env DISPLAY=:99 xdotool search --onlyvisible --name 'HP Smart Tank Plus 570 series' 2>/dev/null | while read w; do n=\$(timeout 2 env DISPLAY=:99 xdotool getwindowname \$w 2>/dev/null || true); [ -n \"\$n\" ] && echo \$w && break; done" || true)
  echo "$id"
}

# Click on a word found by OCR, retrying for a while.
click_word() {
  local id="$1" word="$2" tries="${3:-20}"
  local png="/tmp/shot_$$.png"
  for _ in $(seq 1 "$tries"); do
    local live
    live=$(find_installer_window)
    if [ -n "$live" ] && shot "$live" "$png" 2>/dev/null; then
      local pos
      # pick=last: click the bottom-most occurrence (the real button, not an
      # earlier label in the EULA text).
      if pos=$(find_text "$png" "$word" 2 last); then
        local win_x win_y
        read -r win_x win_y <<<"$pos"
        local ax ay
        ax=$(xsh "timeout 3 env DISPLAY=:99 xdotool getwindowgeometry $live 2>/dev/null | awk '/Position:/{print \$2}' | cut -d, -f1" || true)
        ay=$(xsh "timeout 3 env DISPLAY=:99 xdotool getwindowgeometry $live 2>/dev/null | awk '/Position:/{print \$2}' | cut -d, -f2" || true)
        ax=${ax:-0}; ay=${ay:-0}
        echo ">> clicking '$word' at ($((ax + win_x)), $((ay + win_y)))"
        click $((ax + win_x)) $((ay + win_y))
        return 0
      fi
    fi
    sleep 1
  done
  echo "warn: word '$word' not found after $tries tries" >&2
  return 1
}

# Check a WebView checkbox by clicking just left of a label word.
check_box_before_word() {
  local id="$1" label="$2" tries="${3:-20}"
  local png="/tmp/shot_$$.png"
  for _ in $(seq 1 "$tries"); do
    local live
    live=$(find_installer_window)
    if [ -n "$live" ] && shot "$live" "$png" 2>/dev/null; then
      local pos
      # pick=first: the checkbox sits just left of the first label word.
      if pos=$(find_text "$png" "$label" 2 first); then
        local win_x win_y
        read -r win_x win_y <<<"$pos"
        local ax ay
        ax=$(xsh "timeout 3 env DISPLAY=:99 xdotool getwindowgeometry $live 2>/dev/null | awk '/Position:/{print \$2}' | cut -d, -f1" || true)
        ay=$(xsh "timeout 3 env DISPLAY=:99 xdotool getwindowgeometry $live 2>/dev/null | awk '/Position:/{print \$2}' | cut -d, -f2" || true)
        ax=${ax:-0}; ay=${ay:-0}
        for off in 20 30 40 55; do
          local cx=$((ax + win_x - off)) cy=$((ay + win_y))
          echo ">> trying checkbox at ($cx, $cy)"
          click "$cx" "$cy"
        done
        return 0
      fi
    fi
    sleep 1
  done
  echo "warn: label '$label' not found after $tries tries" >&2
  return 1
}

# --- main -----------------------------------------------------------------

echo "==> webpack: $WEBPACK"
docker cp "$WEBPACK" "$C:/tmp/installer.exe" 2>/dev/null \
  || { echo "error: cannot copy $WEBPACK into $C (does the container run?)" >&2; exit 1; }

# clean any previous installer state so re-runs don't conflict
# (exclude this shell's own PID, since pgrep -f matches its own cmdline)
xsh 'SELF=$$
for p in $(pgrep -f "HP-DQEX5" 2>/dev/null); do [ "$p" != "$SELF" ] && kill -9 $p 2>/dev/null || true; done
for p in $(pgrep -f "installer[.]exe" 2>/dev/null); do [ "$p" != "$SELF" ] && kill -9 $p 2>/dev/null || true; done
su -s /bin/bash wineuser -c "wineserver -k" 2>/dev/null || true
sleep 3'

# Xvfb + explorer (needed for Wine windows to render)
xsh 'pgrep -a Xvfb >/dev/null || (Xvfb :99 -screen 0 1280x800x24 -ac >/tmp/xvfb.log 2>&1 & sleep 2)
su -s /bin/bash wineuser -c "WINEDEBUG=-all explorer.exe /desktop" >/dev/null 2>&1 &' || true
sleep 3

# launch the webpack in the background (with the keylog shim if present)
docker exec "$C" bash -c 'cd /tmp && DISPLAY=:99 su -s /bin/bash wineuser -c \
  "export DISPLAY=:99; export SSLKEYLOGFILE=/capture/keys.log; \
   export LD_PRELOAD=/opt/sslkeylog-gnutls.so; export WINEDEBUG=-all; \
   wine installer.exe"' >/tmp/installer_run.log 2>&1 &
echo "==> installer launched"

# --- screen 1: "Let's get started" -> Continue ---------------------------
echo "==> waiting for installer window..."
WIN=$(wait_window "HP Smart Tank Plus 570 series" 90) || { cat /tmp/installer_run.log >&2; exit 1; }
echo "==> installer window: $WIN"

sleep 3
click_word "$WIN" "Continue" 30 || echo "warn: could not click Continue"

# --- screen 2: EULA -> check "I have reviewed..." -> Accept ---------------
echo "==> waiting for EULA screen..."
sleep 4
check_box_before_word "$WIN" "have" 30 || true
click_word "$WIN" "Accept" 30 || echo "warn: could not click Accept"
click_word "$WIN" "Next" 20 || true

echo
echo "==> Installer driving done (as far as scripted)."
echo "    Continue manually via VNC/X if further screens appear."
echo "    Installer log: /tmp/installer_run.log"