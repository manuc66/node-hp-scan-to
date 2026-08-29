# Changelog

All notable changes to this project are documented in this file.

> **Note:** all public communication on this repository is done in English.

## [Unreleased]

### Added

- **macOS packages**: each release now also ships a universal2 (Intel &
  Apple Silicon) `.pkg` installer and `.dmg` disk image built natively on a
  dedicated macOS CI job. They wrap the app in a proper
  `node-hp-scan-to.app` bundle (icon, `Info.plist`, bundled `default.json`,
  LaunchAgent reference). Code signing and Apple notarization are wired into
  the pipeline behind secrets and are skipped when none are configured, so
  releases keep working without an Apple Developer account.
- **Homebrew cask** (`packaging/homebrew/node-hp-scan-to.rb`): installs the
  universal `.dmg` on both Intel and Apple Silicon Macs.

## [1.11.0] - 2026-08-29

### Added

- **Standalone executables**: each release now ships self-contained binaries
  (Windows x64, macOS Intel & Apple Silicon, Linux x64/arm64 and Alpine musl
  builds) that need no Node.js installation. They read
  `config/default.json` placed next to the executable.
- **Windows installer** (`setup-node-hp-scan-to-*.exe`) with two modes:
  - _For me_ (default, no admin rights): installs to `%LOCALAPPDATA%`,
    starts hidden at login via a scheduled task, scans go to
    `Documents\hp-scan` (follows OneDrive redirection).
  - _Windows service for all users_: installs to `Program Files`, runs as a
    WinSW service, scans go to `C:\ProgramData\node-hp-scan-to\scans`.
  - During setup it discovers printers on the network, lets you pin one by IP,
    set the destination label shown on the printer's screen, and choose the
    startup behaviour (`listen` or `adf-autoscan`). Ships with a proper app
    icon and trademark/endorsement disclaimers.
- **New `discover` command**: lists every HP scan-capable device found on the
  network. Devices are located via mDNS and verified against the printer's
  proprietary `DiscoveryTree.xml` endpoint, so other network gadgets are
  filtered out. Output is one `name<TAB>ip` pair per device (`--json` for a
  machine-readable array). Handy for picking the right `--name` (recommended
  over a fixed IP, since it keeps working when the printer's DHCP lease
  changes).
- **Linux packages**: `.deb`/`.rpm` (x64/arm64) and Alpine `.apk` (musl)
  packages with a hardened systemd unit (dynamic non-root user,
  `PrivateTmp`, read-only paths), a per-user unit, an example configuration
  in `/etc/node-hp-scan-to/default.json` and scans under
  `/var/lib/node-hp-scan-to`.
- **Release provenance**: release artifacts ship with Sigstore build
  provenance, a CycloneDX SBOM and a `SHA256SUMS.txt` checksum file. The
  pipeline is also wired for code-signing the Windows installer via SignPath
  (test-signing on manual runs, release-signing on tagged releases) — no
  signed installer has been produced yet.
- **BMP scan format**: `-f, --image-format Bmp` in addition to `Jpeg`.
- Structured logging via pino, with a child logger per module.
  - The default stdout output stays **backward compatible**: plain message
    text (one per line), identical to the previous `console.log` output, so
    integrators parsing stdout are not broken.
  - Structured JSON lines are **opt-in** via `LOG_FORMAT=json` (recommended
    for docker log drivers and aggregators).
  - `LOG_FORMAT=pretty` forces human-readable output (time/level/module)
    anywhere; `LOG_FORMAT=plain` forces the legacy message-only text anywhere.
  - `LOG_LEVEL` environment variable (`trace`…`fatal`, default `info`);
    `-D/--debug` enables debug logging from startup.
- Redaction of sensitive fields (`password`, `token`, `authToken`,
  `Authorization`) and sanitized error serialization: axios `config`/`request`
  are never written to logs.
- Local ESLint rule `pino/correct-args-position` enforcing pino argument order
  (object context before message).
- App icon and README banner.
- Automatic AUR and winget package updates on tagged releases.
- Supported device: HP DeskJet Ink Advantage 4530 (the community-reported
  list now lives in `SUPPORTED_DEVICES.md`).

### Changed

- Generated PDFs now embed the scan trigger time in their `/CreationDate`
  and `/ID` metadata instead of the time the PDF was generated, making the
  metadata stable for a given scan (and deterministic in tests).
- The CLI now exits with a non-zero code when the command fails (previously
  errors were logged but the process still exited `0`), so scripts and
  automated tests can detect failures.
- Paperless/Nextcloud upload failures are surfaced as a structured status
  instead of an exception: `single-scan` exits `1` and logs
  "Scan completed but delivery to paperless/nextcloud failed: …" when a
  delivery fails, both targets (paperless and nextcloud) are attempted and
  reported, and temporary files are kept when delivery failed. Long-running
  `listen`/`adf-autoscan` loops are unaffected and keep running.
- Walkup scans now use the **printer-specified `UserActionTimeout`** when
  waiting for the button press on the device instead of a fixed timeout
  ([#1543](https://github.com/manuc66/node-hp-scan-to/issues/1543)).
- The scanner state `BusyWithScanJob` is now recognized and handled (the scan
  is aborted with a clear message) instead of being treated as an unknown
  state.
