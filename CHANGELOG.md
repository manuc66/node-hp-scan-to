# Changelog

All notable changes to this project are documented in this file.

> **Note:** all public communication on this repository is done in English.

## [Unreleased]

### Added

- **Post-processing command**: `--post-command <template>` (or `post_command`
  in the config file) runs an external command over every generated scan file
  (PDFs and delivered images) before it is uploaded or cleaned up, e.g. to
  produce PDF/A archives, sign documents, inject metadata or watermark
  images, without bundling or maintaining any of those tools in the project.
  The template supports `{input}` (the file path) and `{output}` (a temp file
  that atomically replaces the file on success); without `{output}` the
  command is expected to modify the file in place. Commands that fail never
  block the flow: the original file is kept and the error is logged.

### Changed

- **Early validation of file patterns**: the `--pattern` / `pattern` value is
  now checked at startup against the file name rules of the **running
  platform** instead of failing when the scan file is written, so existing
  patterns stay valid where they already work. Windows rejects a name that
  the `sanitize-filename` package would change (forbidden characters such as
  `:`, reserved device names, trailing dots/spaces), while Linux and macOS
  (APFS) only reject `/`; a pattern like `"scan"_dd.mm.yyyy_HH:MM:ss` is
  thus rejected on Windows but still fine on POSIX systems. The documented
  pattern example (`--pattern` help, README) was updated to the `: `-free
  `"scan"_dd.mm.yyyy_HHMMss` form, which works everywhere.

### Fixed

- **Tests on Windows**: the suite now runs green again on Windows. The README
  help snapshot test compares line endings that git may convert to CRLF, the
  `~` home expansion produced mixed path separators, and the read-only folder
  checks relied on `chmod`, which has no effect on directories on Windows.
  - README snapshot normalization: `test/readme.test.ts` no longer fails on a
    CRLF checkout.
  - `PathHelper.getOutputFolder`: `~` expansion now goes through
    `path.join`, so paths use the platform separator consistently.
  - `PathHelper.checkIfFolderIsWritable` now performs a real temporary write
    (create + delete) instead of `fs.access(W_OK)`, which does not honor ACLs
    or the read-only attribute on Windows; the writability tests use an
    `icacls` deny on Windows (ACLs) and keep the `chmod` approach on POSIX.
  - Timestamp patterns containing `:` cannot produce a valid file name on
    Windows; that formatting case is skipped there.

## [1.11.1] - 2026-08-29

### Fixed

- **Standalone executables**: in interactive terminals the `pretty` log mode
  crashed with `unable to determine transport target for "pino-pretty"`. A
  compiled Bun binary bundles every module, so the pino worker-thread
  transport cannot resolve its target at runtime. Bun now runs pino-pretty
  in-process (the same path already used for the plain/service mode);
  Node.js keeps the worker transport.

### Added

- Tests guarding the Bun pretty-mode regression: a unit test for the
  in-process/worker decision plus an integration test that compiles a real
  Bun executable and runs it in `LOG_FORMAT=pretty` (skipped when bun is not
  installed).
- **Automated releases**: a `Release` GitHub Actions workflow
  (`.github/workflows/release.yml`) that bumps the version, dates the
  changelog, commits and tags in one step (manual `workflow_dispatch`).
  `release.sh` was rewritten to be non-interactive and to match that flow
  (single commit + annotated tag).

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
