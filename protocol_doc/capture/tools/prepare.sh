#!/bin/bash
# prepare.sh — rebuild the isolated Wine container from scratch and copy in
# the HP Windows driver + printer config needed for scan-to-PC capture.
#
# Everything runs in the container's own network namespace:
#   - macvlan on the host LAN  -> multicast (mDNS/WSD) discovery works
#   - bridge in parallel       -> internet (apt, HP downloads)
# The host network / cert store are never touched.
#
# Usage:
#   prepare.sh <windows-driver-root> [printer-serial.ini] [printer-ip] [lan-subnet] [lan-gateway] [lan-range] [host-iface]
#
#   <windows-driver-root> : the base folder of the HP Windows driver install
#                           containing "Program Files/HP/..." and
#                           "ProgramData/HP/..." (a mounted Windows drive).
#   [printer-serial.ini]  : relative path of the printer NetworkDevices ini
#                           (default: HP Smart Tank Plus 570 series/NetworkDevices/<SERIAL>.ini)
#   [printer-ip]          : IP to force in that ini (no default; required)
#   [lan-subnet]          : macvlan subnet (default: 192.168.0.0/23 — CHANGE IT)
#   [lan-gateway]         : macvlan gateway (default: 192.168.0.1 — CHANGE IT)
#   [lan-range]           : macvlan IP range (default: 192.168.0.200/28 — CHANGE IT)
#   [host-iface]          : host interface for macvlan (default: eth0 — CHANGE IT)
#
# Example:
#   ./prepare.sh "/mnt/win" "HP Smart Tank Plus 570 series/NetworkDevices/CNXXXX.ini" \
#     192.168.1.50 192.168.1.0/24 192.168.1.1 192.168.1.200/28 enp2s0
set -euo pipefail

WIN="${1:?usage: prepare.sh <windows-driver-root> [printer-serial.ini] [printer-ip]}"
INI_REL="${2:-HP Smart Tank Plus 570 series/NetworkDevices/<SERIAL>.ini}"
IP="${3:?printer-ip is required}"
SUBNET="${4:-192.168.0.0/23}"
GATEWAY="${5:-192.168.0.1}"
IPRANGE="${6:-192.168.0.200/28}"
IFACE="${7:-eth0}"

ST570_BIN="$WIN/Program Files/HP/HP Smart Tank Plus 570 series/Bin"
INI_SRC="$WIN/ProgramData/HP/$INI_REL"
C=wine-capture-test
NET=scanlan

echo "==> Windows driver root : $WIN"
echo "==> Driver Bin          : $ST570_BIN"
echo "==> Printer config      : $INI_SRC (IP forced to $IP)"

# --- networks -----------------------------------------------------------
docker network inspect "$NET" >/dev/null 2>&1 || \
  docker network create -d macvlan --subnet="$SUBNET" \
    --gateway="$GATEWAY" --ip-range="$IPRANGE" \
    -o parent="$IFACE" "$NET" >/dev/null
echo "==> macvlan network ready: $NET"

# --- container -----------------------------------------------------------
docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" --network "$NET" --cap-add=NET_ADMIN \
  -v "$(dirname "$0")/../..":/repo:ro \
  wine-capture sleep 3600 >/dev/null
docker network connect bridge "$C" 2>/dev/null || true
sleep 3
echo "==> container up: $C (macvlan + bridge)"

# --- base tools ----------------------------------------------------------
docker exec "$C" bash -c 'echo nameserver 8.8.8.8 > /etc/resolv.conf
apt-get update -qq >/dev/null 2>&1
apt-get install -y -qq --no-install-recommends \
  iputils-ping gcc libgnutls28-dev tcpdump xdotool x11-utils \
  tesseract-ocr imagemagick >/dev/null 2>&1'
echo "==> tools installed"

# --- Wine prefix (reliable: disable mono/gecko prompts at first boot) ---
docker exec "$C" bash -c 'su -s /bin/bash wineuser -c "WINEDLLOVERRIDES=mscoree=,mshtml= WINEDEBUG=-all timeout 120 wineboot -i"' >/dev/null 2>&1 || true
docker exec "$C" bash -c 'test -d /home/wineuser/.wine/drive_c/windows/mono || (
  cd /tmp && wget -q https://dl.winehq.org/wine/wine-mono/9.4.0/wine-mono-9.4.0-x86.msi -O wine-mono.msi
  su -s /bin/bash wineuser -c "WINEDEBUG=-all timeout 90 wine msiexec /i /tmp/wine-mono.msi /qn")' >/dev/null 2>&1 || true
echo "==> Wine prefix ready (mono installed)"

# --- keylog shim (GnuTLS SSLKEYLOGFILE) -----------------------------------
docker exec "$C" bash -c 'cp /repo/protocol_doc/capture/tools/sslkeylog-gnutls.c /opt/ 2>/dev/null
gcc -shared -fPIC -o /opt/sslkeylog-gnutls.so /opt/sslkeylog-gnutls.c -ldl -lgnutls 2>/dev/null || true'
echo "==> keylog shim built: /opt/sslkeylog-gnutls.so"

# --- Xvfb ----------------------------------------------------------------
docker exec "$C" bash -c 'pgrep -a Xvfb >/dev/null || (Xvfb :99 -screen 0 1280x800x24 -ac >/tmp/xvfb.log 2>&1 & sleep 2)'

# --- driver binaries ------------------------------------------------------
docker exec "$C" bash -c 'mkdir -p /home/wineuser/HP-driver && chown wineuser:wineuser /home/wineuser/HP-driver'
docker cp "$ST570_BIN/." "$C:/home/wineuser/HP-driver/" >/dev/null 2>&1 || true
docker exec "$C" bash -c 'chown -R wineuser:wineuser /home/wineuser/HP-driver'
echo "==> driver binaries copied to /home/wineuser/HP-driver"

# --- printer network config (forced IP) ------------------------------------
docker exec "$C" bash -c 'mkdir -p "/home/wineuser/.wine/drive_c/ProgramData/HP" && chown -R wineuser:wineuser /home/wineuser/.wine/drive_c/ProgramData'
docker cp "$INI_SRC" "$C:/home/wineuser/.wine/drive_c/ProgramData/HP/$(basename "$(dirname "$INI_SRC")")/$(basename "$INI_SRC")" >/dev/null 2>&1 || true
docker exec "$C" bash -c "find /home/wineuser/.wine/drive_c/ProgramData/HP -name '*.ini' -exec sed -i 's/^IPAddress=.*/IPAddress=$IP/' {} + 2>/dev/null || true"
echo "==> printer config with IP=$IP"

echo
echo "==> container ready: $C"
echo "    wine:    docker exec $C su -s /bin/bash wineuser -c 'wine --version'"
echo "    daemon:  docker exec $C bash -c 'cd /home/wineuser/HP-driver && DISPLAY=:99 su -s /bin/bash wineuser -c \"wine ScanToPCActivationApp.exe -scfn TestPC\"'"