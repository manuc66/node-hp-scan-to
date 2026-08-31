# Capturing the HP driver network traffic on native Windows (mitmproxy)

> Reproducible procedure for issue
> [#1019](https://github.com/manuc66/node-hp-scan-to/issues/1019): on a
> native Windows machine, capture (a) the printer exchanges and (b) the
> proprietary HP driver HTTPS exchanges in the
> **clear**, using **mitmproxy**. Everything is scripted in
> `protocol_doc/capture/tools/capture-https-windows.ps1`; the steps below can also
> be done by hand.

This is the recommended, validated way on native Windows: the HP driver
connects **directly to the printer IP** (it ignores the system proxy), so a
classic forward proxy does not help.

> Native Windows **SChannel does not support `SSLKEYLOGFILE`**, which is why
> this MITM approach is required on Windows. Under Linux/Wine, the
> `LD_PRELOAD` GnuTLS shim from this repo (`sslkeylog-gnutls.c`) is the
> alternative — no certificate install needed.

## Reference observations (HP Smart Tank Plus 570 — one device)

> Device-dependent — not all devices expose eSCL or `WalkupScan*`. What a
> capture contains depends on the device; treat these as one data point.

On the tested ST570:

- The `NetworkDevices\<SERIAL>.ini` is configured with `PortNumber=80`
  (**plain HTTP**) for the control plane: `DevMgmt/DiscoveryTree.xml`,
  `WalkupScanToCompCaps`, `WalkupScanToCompDestinations` (GET/POST/DELETE),
  `EventMgmt/EventTable?timeout=1200` (long-poll) and
  `WalkupScanToCompEvent`.
- The **scan-to-PC job flow runs over HTTPS on 443** in this capture:
  `POST /eSCL/ScanJobs → 201`, `GET /eSCL/ScanJobs/<id>/NextDocument` (the
  scanned page image, e.g. ~74 kB JPEG), `GET /eSCL/ScanJobs/<id>/ScanImageInfo`,
  `GET /eSCL/ScannerStatus`, `GET /eSCL/eSCLConfig`.
- **The daemon ignores the ini IP address at runtime** → the classic ini
  redirect (`IPAddress=127.0.0.1`) does **not** intercept it; it keeps
  talking to the real printer IP. Capturing therefore requires redirecting at
  the **IP/route level** (Step 2, mode `-IpRedirect`).

## Result you get

- **Traffic pcap**: a Wireshark/tshark capture of the printer exchanges
  (`host <printer>`) — readable directly, no keys.
- **HTTPS**: every request/response the driver actually exchanges with the
  device, decrypted in the mitmweb UI, replayable `.flow` dumps plus
  extracted response bodies. What those requests are depends on the device
  (eSCL, `WalkupScan`/`WalkupScanToComp`, or neither).

## Prerequisites

1. **Windows 10/11, PowerShell 5.1+** — the script uses Windows cmdlets
   (`Get-NetIPInterface`, `New-NetIPAddress`) and `netsh`.
2. **The HP application installed** on this machine (the driver daemon that
   generates the traffic to capture).
3. **Wireshark** (bundles Npcap) — clear-text capture.
4. **mitmproxy 12+** (binary installer, or `pip install mitmproxy`). The script
   finds `mitmweb.exe` automatically (default
   `C:\Program Files\mitmproxy\bin\mitmweb.exe`). The bundled Python covers
   `export-flows.py` (run via `mitmdump -s`); no separate Python install
   needed.
5. **Administrator rights** — to add the route/IP, the CA import and the
   portproxy. The script self-elevates via UAC; alternatively use
   **gsudo** (`winget install -e --id gerardog.gsudo`):

   > After installing gsudo, refresh the `PATH` or open a new terminal:
   > ```powershell
   > $env:Path = [Environment]::GetEnvironmentVariable("Path","User") + ";" + [Environment]::GetEnvironmentVariable("Path","Machine")
   > ```
6. The printer **IPv4 address** (the IPv6 link-local for the upstream is read
   automatically from the ini, or passed with `-PrinterIPv6`).

## Step 1 — Check the transport (before redirecting)

Driver still configured normally; nothing changed yet. A quick capture of
everything to/from the printer is worth it first — it shows which ports are
used, and whether the device does any multicast-based discovery (only visible
during a fresh “add printer” in the app):

```powershell
Get-NetAdapter | Where-Object Status -eq Up            # pick the LAN interface
& "$env:ProgramFiles\Wireshark\tshark.exe" -i "Ethernet" `
  -f "host <PRINTER_IP>" `
  -w "$PWD\capture.pcap"
```

Trigger printer activity in the HP application (re-detect the printer, run a
scan), then Ctrl+C. Check which ports appear: `80`/`8080` = plain HTTP,
`443` = HTTPS. On the reference ST570 the HTTPS (443) eSCL flow was the one
needing decryption.

## Step 2 — Capture with IP redirection (recommended; validated)

This hijacks the printer's IPv4 **on this machine** (loopback route + the IP
assigned locally), binds mitmweb on `<PRINTER_IP>:443`, forwards `<PRINTER_IP>:80`
via portproxy to a local HTTP reverse proxy, and forwards upstream to the
**real printer over its IPv6 link-local** (so there is no loop). The real
printer is untouched — only outbound connections from this PC are captured.

```powershell
cd <repo>
gsudo powershell -ExecutionPolicy Bypass -File .\protocol_doc\capture\tools\capture-https-windows.ps1 `
  -IpRedirect -PrinterIP 192.168.129.21

# or let the script self-elevate via UAC:
powershell -ExecutionPolicy Bypass -File .\protocol_doc\capture\tools\capture-https-windows.ps1 `
  -IpRedirect -PrinterIP 192.168.129.21
```

What it does, in order:

1. Kills any stale `mitmweb` from a previous session.
2. Reads the printer IPv6 link-local from the ini (override: `-PrinterIPv6 fe80::…`),
   and the driver config path (override: `-ConfigIni <path>`).
3. Assigns the printer IP to the loopback interface + an on-link route
   (`192.168.129.21/32` on the loopback) — the daemon's connections to that
   IP now land on this machine.
4. Starts `mitmweb` **bound to `<PRINTER_IP>:443`** in reverse mode
   (`--mode reverse:https://[fe80::…] --ssl-insecure --set connection_strategy=lazy`).
   Binding the hijacked IP directly makes the presented leaf cert
   `CN=<PRINTER_IP>` (name verification passes).
5. Starts a second `mitmweb` on `127.0.0.1:8444` as reverse HTTP
   (`reverse:http://[fe80::…]`) + `netsh portproxy` forwarding
   `<PRINTER_IP>:80 → 127.0.0.1:8444` (plain HTTP needs no correct-name cert).
6. Imports the mitmproxy CA into `Cert:\LocalMachine\Root` (fallback
   `Cert:\CurrentUser\Root`).
7. Writes the session `README.txt` (UI tokens) to `$PWD\hp-mitm-capture\`.

### Quick check it's armed

```powershell
Get-NetRoute -DestinationPrefix "192.168.129.21/32"   # route present
netstat -ano | Select-String "192.168.129.21:443"      # mitmweb listening
Get-NetIPAddress 192.168.129.21                         # IP on loopback
```

## Step 3 — Trigger, read, save

1. **Restart the HP application** (`ScanToPCActivationApp.exe` / “HP Scan”).
2. Open the mitmweb UIs with the printed tokens:
   - HTTPS events: http://127.0.0.1:8081
   - HTTP events:  http://127.0.0.1:8082
3. Trigger a scan / device events from the printer panel. The requests the
   device actually uses appear **decrypted** in mitmweb (on the ST570 above:
   `POST /eSCL/ScanJobs` then `NextDocument` page image).
4. **Save the flows** (mitmweb keeps them in memory). Export both instances
   to `.flow` dumps (replayable, kept outside the repository):

```powershell
$dir = "C:\Users\<you>\Documents\hp-mitm-capture\capture-$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force $dir | Out-Null
curl.exe -s "http://127.0.0.1:8081/flows/dump?token=<TOKEN_HTTPS>" -o "$dir\https-scan-to-pc.flow"
curl.exe -s "http://127.0.0.1:8082/flows/dump?token=<TOKEN_HTTP>"  -o "$dir\http-control.flow"
```

5. **Extract the readable bodies** (scanned pages, XML) from the dumps:

```powershell
& "C:\Program Files\mitmproxy\bin\mitmdump.exe" -q -n -r "$dir\https-scan-to-pc.flow" -s $repo\protocol_doc\capture\tools\export-flows.py
& "C:\Program Files\mitmproxy\bin\mitmdump.exe" -q -n -r "$dir\http-control.flow"  -s $repo\protocol_doc\capture\tools\export-flows.py
# → wrote exported\summary.txt + exported\resp_<ts>_GET_....img/xml/text
```

Re-open a dump later in the UI: `mitmweb -r "$dir\https-scan-to-pc.flow"`.

## Step 4 — Restore

```powershell
gsudo powershell -ExecutionPolicy Bypass -File .\protocol_doc\capture\tools\capture-https-windows.ps1 -Restore
```

It removes the loopback route/IP and the portproxy rule, desinstalls the
mitmproxy CA, kills the mitmweb processes, and repairs the
driver ini if it was left pointing at `127.0.0.1`. The HP application is
**not** restarted — do it manually, then re-detect the printer.

> Note: the HP application can rewrite `NetworkDevices\*.ini` by itself while
> a session is edited. On restore, the script deliberately picks the newest
> backup that points at a **real IP** (not `127.0.0.1`).

## Script parameters

| Parameter | Meaning |
| --- | --- |
| `-PrinterIP <ip>` | printer IPv4 to hijack |
| `-PrinterIPv6 <fe80::…>` | upstream printer; else read from the ini |
| `-ConfigIni <path>` | explicit driver ini path |
| `-MitmwebPath <exe>` | explicit mitmweb binary |
| `-WebPort 8081` | HTTPS UI port |
| `-WebPortHttp 8082` | HTTP UI port |
| `-HttpProxyPort 8444` | local HTTP reverse-proxy port (portproxy target) |
| `-Restore` | revert everything for the current mode |
| `-SkipElevate` | do not self-elevate (already elevated / testing) |

## Manual (no-script) equivalent

```powershell
# 1. hijack the printer IP locally (admin)
Get-NetIPInterface | Where-Object InterfaceAlias -like "*loopback*" | % IFaceIndex = 1
New-NetIPAddress -InterfaceIndex 1 -IPAddress 192.168.129.21 -PrefixLength 32
Get-NetRoute -DestinationPrefix "192.168.129.21/32" -ErrorAction SilentlyContinue

# 2. HTTPS reverse proxy bound on the printer IP; upstream via IPv6 link-local
mitmweb --listen-host 192.168.129.21 --listen-port 443 `
  --mode "reverse:https://[fe80::5281:40ff:fe69:27cc]" --ssl-insecure `
  --set connection_strategy=lazy --set web_password=<token>

# 3. HTTP kept working via portproxy (admin)
mitmweb --listen-host 127.0.0.1 --listen-port 8444 `
  --mode "reverse:http://[fe80::5281:40ff:fe69:27cc]" --ssl-insecure
netsh interface portproxy add v4tov4 listenaddress=192.168.129.21 listenport=80 `
  connectaddress=127.0.0.1 connectport=8444

# 4. trust the CA (admin)
Import-Certificate -FilePath "$HOME\.mitmproxy\mitmproxy-ca-cert.pem" `
  -CertStoreLocation Cert:\LocalMachine\Root
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `gsudo` not recognized | PATH not refreshed — re-open the terminal or refresh `$env:Path`. |
| Script stops at “Requesting administrator rights” | UAC declined — accept it, or run through `gsudo`. |
| Nothing flows into mitmweb during the scan | Daemon talking to the real IP but not intercepted: verify the loopback route + `netstat` listener (Step 2 “Verify”). |
| mitmweb UI: “403 Authentication Required” | Use the token printed by the script / in the session `README.txt`. |
| Old mitmweb still holds the port | The script kills stale `mitmweb` at startup; move on. |
| Driver refuses the certificate | CA not imported: check `certmgr.msc` → Trusted Root → “mitmproxy”, re-run elevated. If it still refuses, the driver may **pin** the printer’s certificate — the device accepts a self-signed one, so pinning is unlikely, but if present only a switch/firmware-level capture can help. |
| Restore re-applies a `127.0.0.1` ini | The app rewrote the ini during capture; run `-Restore` again after closing the HP app. |
| Port 8081/8082 already used | Pass `-WebPort`/`-WebPortHttp` to different ports. |

## Related files

- `protocol_doc/capture/tools/capture-https-windows.ps1` — setup/restore.
- `protocol_doc/capture/tools/export-flows.py` — extract readable bodies from `.flow`.
- `protocol_doc/capture/wine-gnutls-keylog.md` — the Wine/Linux
  alternative (GnuTLS `LD_PRELOAD` keylog, no MITM).
- `protocol_doc/capture/README.md` — index: pick your method.