# Changelog

All notable changes to this project are documented in this file.

> **Note:** all public communication on this repository is done in English.

## [1.11.0] - Unreleased

### Added

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
