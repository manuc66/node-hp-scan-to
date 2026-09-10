# Capturing clear-text network exchanges from the proprietary HP driver

> Addresses the task of issue [#1019](https://github.com/manuc66/node-hp-scan-to/issues/1019):
> document how to capture and analyze in the **clear** the network exchanges
> between the proprietary HP driver (Windows) and the printer, in particular
> when the communication is HTTPS-encrypted.

## Prerequisites (Linux)

1. A **Linux host** (Debian-based, as used here) with **Docker** supporting
   `bridge` + `macvlan` networks and the `NET_ADMIN` capability.
2. The **HP driver files on disk** (Windows install media / files):
   - the interactive installer webpack (`Full_Webpack-*.exe`), and/or
   - an extracted **DriverStore** (for static analysis via `fetch-driver.sh`),
     and/or
   - the real driver config `ProgramData/HP/<Product>/NetworkDevices/<SERIAL>.ini`.
   Mount the Windows drive (e.g. `/mnt/win`) and pass its root to
   `prepare.sh`.
3. The printer reachable on the LAN.
4. Everything else (WineHQ `wine-devel`, mono, tcpdump, tshark, gcc/libgnutls)
   is built inside the container by `prepare.sh`.

## Why it is needed

The proprietary HP protocols (`WalkupScanToComp`, `WalkupScan`, `ScanJob`,
`eSCL`) are documented in `protocol_doc/` from captures made on Windows
machines **over plain HTTP** (ports 80/8080). On newer printers
(e.g. `HP Smart Tank Plus 570 series`) the driver code also references a
"secure" variant — the path constant
`/WalkupScanToComp/SecureWalkupScantoCompDestinations` (and the schema
`wus:/SecureWalkupScantoCompDestinations`) — which would be used over
HTTPS. Note that on the tested device this endpoint is **not exposed**
(it returns 404 on ports 80/443/8080); it is a code constant, not a
confirmed device endpoint. To keep reverse-engineering these protocols,
the HTTPS traffic still needs to be readable in the clear.

## The problem: SSLKEYLOGFILE does not work under Wine

The classic "Wireshark + `SSLKEYLOGFILE`" method (proposed in the issue)
does **not** work for a Windows driver running under Wine:

- native **Windows SChannel** never writes a key log (`SSLKEYLOGFILE` is not
  supported there);
- **Wine's schannel** is a re-implementation based on **GnuTLS** which, also,
  never calls `gnutls_session_set_keylog_function()` (verified in the
  Wine 11.x source: no `keylog` symbol).

As a result, a classic MITM (mitmproxy) is not enough either, because Wine's
WinHTTP certificate validation does not read the crypt32 certificate store
(`ERROR_WINHTTP_CERT_NOT_TRUSTED` even with the printer's real self-signed
certificate imported as a root).

## The validated solution: enable the GnuTLS keylog via LD_PRELOAD

Wine loads the system **libgnutls** library for its schannel. libgnutls
exposes `gnutls_session_set_keylog_function()` (exported in
`libgnutls.so.30`). Intercepting `gnutls_init()` with a small `LD_PRELOAD`
shim is enough to register that callback on every TLS session: all session
keys are then written in NSS format
(`CLIENT_RANDOM <client_random_hex> <master_secret_hex>`), which Wireshark /
tshark can decrypt.

The capture is done **without MITM**: the driver talks directly to the
printer, and one combines (a) the traffic pcap and (b) the key log file.

## Diagram

```
HP Windows driver (under Wine, dedicated uid, inside a container)
   │  direct HTTPS to <printer-ip>:443
   ▼
gnutls_init() interception ──►  SSLKEYLOGFILE (session keys)
   │
   ▼
tcpdump (in the container) ──►  pcap
   │
   └──► tshark -o tls.keylog_file:keys.log  →  plaintext
```

Everything happens **inside an isolated Docker container** (private network
namespace): no host network change, no system proxy, no certificate in the
host store.

## Components

### 1. LD_PRELOAD shim (`sslkeylog-gnutls.c.txt`)

See `protocol_doc/capture/tools/sslkeylog-gnutls.c.txt` for the full source. Compile:

```bash
gcc -shared -fPIC -x c -o sslkeylog-gnutls.so sslkeylog-gnutls.c.txt -ldl -lgnutls
```

> Note: the `wrong ELF class` warning at startup (the 32-bit Wine process
> cannot preload the 64-bit shim) is **harmless** — the 64-bit process (the
> one running the x64 HP binaries) does load the shim.

### 2. Isolated Docker Wine environment

Base: Debian bookworm + **Wine from the WineHQ repository** (`wine-devel`;
**pin amd64/i386 to the same version**, e.g. 11.10, because the bookworm
repo can temporarily have a newer amd64 than i386), plus Xvfb, tcpdump,
tshark, mono, gcc/libgnutls. See `protocol_doc/capture/tools/Dockerfile` and
`protocol_doc/capture/tools/prepare.sh` for the full rebuild recipe.

Launch (default **bridge** network, no `--network=host`):

```bash
docker run -d --name wine-capture --network bridge --cap-add=NET_ADMIN \
  -v "$PWD/capture:/capture" wine-capture sleep 3600
```

### 3. Capture an HTTPS call (end-to-end validation)

The HP driver uses WinHTTP/WinINet. To validate the method without a full
install (the complete driver needs an interactive installer), a minimal
WinHTTP client is enough (`protocol_doc/capture/tools/winhttp-get.c.txt`). Important
points:

- certificate validation must be **disabled** in the client
  (`WINHTTP_OPTION_SECURITY_FLAGS` with `SECURITY_FLAG_IGNORE_*`), otherwise
  WinHTTP fails before sending the request (like the real driver against the
  printer's self-signed certificate);
- run wine with `LD_PRELOAD` + `SSLKEYLOGFILE`.

```bash
export SSLKEYLOGFILE=/capture/keys.log
export LD_PRELOAD=/opt/sslkeylog-gnutls.so
tcpdump -i any -w /capture/capture.pcap 'tcp port 443' &
wine winhttp-get.exe https://<printer-ip>/DevMgmt/DiscoveryTree.xml
kill %1
# Decrypt:
tshark -r /capture/capture.pcap -o 'tls.keylog_file:/capture/keys.log' \
  -Y http -T fields -e http.request.method -e http.host -e http.request.uri -e http.response.code
```

Verified result on an **HP Smart Tank Plus 570 series**:

```
GET <printer-ip>  /DevMgmt/DiscoveryTree.xml   200
```

## Multicast is blocked by the Docker bridge

Printer location uses **multicast**. A Docker container on
the default `bridge` network **does not send/receive LAN multicast**: the
driver cannot locate the printer that way. Two options:

- **macvlan**: the container gets its own LAN IP/MAC
  (`docker network create -d macvlan --subnet=<lan-subnet>
  --gateway=<lan-gateway> --ip-range=<lan-range> -o parent=<host-iface>
  scanlan`), multicast works, and isolation is kept (no sharing of the host
  network stack). Do not forget a `bridge` network in parallel for Internet
  access (apt, HP downloads) and a DNS
  (`echo nameserver 8.8.8.8 > /etc/resolv.conf`).
- alternative: force the printer IP in the driver config
  (`NetworkDevices/<SERIAL>.ini`: `IPAddress=...`, `PortNumber=80`), which
  avoids LAN multicast entirely. This is the path used here since the real
  driver config already provides the IP.

## Tooling (all files in `protocol_doc/capture/tools/`)

| File | Role |
| --- | --- |
| `Dockerfile` | Wine image (WineHQ repo, wine-devel 11.10) + Xvfb, tcpdump, tshark, gcc/libgnutls, mono. Isolated container (no `--network=host`). |
| `prepare.sh` | **Full rebuild recipe**: creates the macvlan+bridge networks, the container, the Wine prefix (mono), the GnuTLS shim, and copies the HP driver + printer config (Windows source path passed as an argument). |
| `drive-installer.sh` | Drives the interactive HP webpack installer under Wine (OCR + xdotool): clicks "Continue", checks the EULA checkbox, clicks "Accept". Experimental — the WebView EULA checkbox is fragile. |
| `fetch-driver.sh` | Copies a complete HP **DriverStore** (driver DLLs) from a Windows install (path as argument) into `driver-store/` (git-ignored). |
| `sslkeylog-gnutls.c.txt` | `LD_PRELOAD` shim enabling `SSLKEYLOGFILE` for GnuTLS (Wine's schannel backend) — the key to decrypt the driver's HTTPS. |
| `winhttp-get.c.txt` | Minimal WinHTTP client (certificate validation disabled) to validate the decryption chain without installing the complete driver. |

Rebuild + driving the installer:

```bash
cd protocol_doc/capture/tools
docker build -t wine-capture .
./prepare.sh "/mnt/win" "HP Smart Tank Plus 570 series/NetworkDevices/CNXXXX.ini" \
  192.168.1.50 192.168.1.0/24 192.168.1.1 192.168.1.200/28 enp2s0
./drive-installer.sh "/downloads/Full_Webpack-50.2.4593_1-ST570_Full_Webpack.exe"
```

Fetching a real DriverStore for static analysis:

```bash
./fetch-driver.sh "/mnt/win/Program Files/HP/HP Smart Tank Plus 570 series/DriverStore"
./fetch-driver.sh "/mnt/win/Program Files/HP/HP Scan/DriverStore"
# → driver-store/<Product>/... (git-ignored, not committed)
```

### The scan-engine DLL

In any HP DriverStore, the code that actually talks to the printer is:

```
<DriverStore>/NGScanDriver/drivers/scanner/x64/HPScanTEDrv_x64.dll
```

It exposes the WalkupScanToComp / ScanJob / eSCL endpoints and the event-wait
loop. For another HP printer, copy its DriverStore with `fetch-driver.sh` and
`strings`-ing `HPScanTEDrv_x64.dll` immediately reveals the supported
endpoints (1st-gen WalkupScan vs 2nd-gen WalkupScanToComp, eSCL, etc.).

## Status and limits

**Validated:**
- the `SSLKEYLOGFILE` method via `LD_PRELOAD` GnuTLS decrypts the HTTPS of
  the Windows driver under Wine (proof: `GET /DevMgmt/DiscoveryTree.xml →
  200 OK`, TLS 1.2 `Finished` decrypted);
- full isolation (bridge/macvlan container, no host network impact);
- static reverse-engineering of the ST570 driver binaries: the code
  references the following endpoint paths —
  `/WalkupScanToComp/WalkupScanToCompCaps`,
  `/WalkupScanToComp/WalkupScanToCompDestinations`,
  `/WalkupScanToComp/WalkupScanToCompEvent`,
  `/WalkupScanToComp/SecureWalkupScantoCompDestinations` (a "secure"
  variant; returns 404 on the tested device, so it is a code constant,
  not a confirmed endpoint), `/WalkupScan/WalkupScanDestinations`,
  `/Scan/Jobs`, `/Scan/Status`, `/EventMgmt/EventTable`,
  `/EventMgmt/EventSubscriptionList`, `/eSCL/ScannerCapabilities`,
  `/eSCL/ScannerStatus`, `/eSCL/WalkupSubscriptions`.

**Remaining limit:**
- the complete driver (`HP Smart Tank Plus 570 series.exe` + the
  `ScanToPCActivationApp.exe` daemon) requires an **interactive install**
  (the HP webpack `hp-dqex5.exe` blocks on the EULA screen whose checkbox is
  a WebView control, hard to drive via xdotool/Xvfb). The MSI
  (`ST570x64.msi`) installed with `msiexec /qn` is not enough: the useful
  binaries are in `ST570x64.cab`/`Full_x64.cab` and the registration
  (services/registry) is done by the webpack.
- once the driver is installed, run `ScanToPCActivationApp.exe
  -scfn <name>` (or `HP Scan Assistant.exe`) with `LD_PRELOAD` +
  `SSLKEYLOGFILE` + `tcpdump`, trigger a scan from the printer panel, and
  read the full protocol in the clear.

## Related files

- `protocol_doc/` — existing protocol documentation (WalkupScan, eSCL).
- `protocol_doc/capture/native-windows-mitmproxy.md` —
  scripted native-Windows procedure (traffic capture + mitmproxy reverse
  proxy + CA import + restore) with
  `protocol_doc/capture/tools/capture-https-windows.ps1` and
  `export-flows.py`.
- The real (Windows) driver provides hints: `config.ini`,
  `PdsmqConfig.xml` (telemetry to `mq.dataservices.hp.com` — out of scope),
  `ProgramData/HP/.../NetworkDevices/<SERIAL>.ini`.