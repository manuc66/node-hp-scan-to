# Capturing the scan-to-PC network traffic

Two validated, reproducible ways to read the proprietary HP driver / printer
exchanges in the clear. Choose by platform — on Windows, the IP-redirect
mitmproxy method is the primary one.

## 1. Windows — mitmproxy with IP redirect (recommended)

→ [`native-windows-mitmproxy.md`](native-windows-mitmproxy.md)

One validated on an **HP Smart Tank Plus 570** (see the doc for the
reference observations). It captures whatever the device really exchanges —
different devices may use eSCL, a 1st/2nd-gen `WalkupScan`, plain HTTP, or
nothing of the sort. Works even when the driver daemon ignores the driver ini
and talks straight to the printer's real IP: it hijacks the printer IPv4 on
the loopback, binds mitmweb on `IP:443`, forwards `IP:80` via portproxy, and
reaches the real printer upstream through its IPv6 link-local. Scripted
end-to-end in `protocol_doc/capture/tools/capture-https-windows.ps1` (setup +
restore).

## 2. Linux / Wine — GnuTLS keylog, no MITM (validated)

→ [`wine-gnutls-keylog.md`](wine-gnutls-keylog.md)

Run the driver under Wine in an isolated Docker container; an `LD_PRELOAD`
shim enables `SSLKEYLOGFILE` on Wine's GnuTLS stack, and tshark decrypts the
pcap (no certificate installation, no MITM). Tools in `protocol_doc/capture/tools/`
(Dockerfile, `prepare.sh`, `sslkeylog-gnutls.c`, `winhttp-get.c`).

## Getting your bearings first (all methods)

A quick interface capture is the friendlier first step: it shows you the lay
of the land — which ports/protocols the device uses, and whether any
multicast-based discovery happens (that only appears during a fresh “add
printer”, not when the device is already registered) — before you reach for a
MITM or the GnuTLS patch:

- pointed capture: `host <printer>` — the direct HTTP/HTTPS exchanges;
- unfiltered interface capture while re-adding the printer — shows the
  discovery side if the device uses it.

If the flow is already **plain HTTP**, Wireshark alone gives you everything,
no MITM needed. Captured pcaps / `.flow` dumps contain private details, so
they stay local (`~/Documents/hp-mitm-capture/`) rather than in the repo.

### Before sharing a dump: what it may contain

A capture rarely carries only the protocol. Before publishing one, make sure
nothing unrelated travels with it:

- **the scanned pages themselves** — prefer a non-sensitive test page;
- **the printer**: serial number, model, MAC, IPv6 link-local address;
- **the PC**: IP address, hostname, MAC (via ARP/DHCP);
- the `.flow` dumps are already **decrypted** — treat them like plain text;
  check the request headers for `Authorization`/cookies and redact if present;
- a capture taken on the whole LAN interface also drags **unrelated traffic**
  (other devices, the Internet). Share only printer-scoped traffic: capture
  with `-f "host <printer>"`, and prefer the mitmweb `.flow` dump over a
  full-interface pcap.