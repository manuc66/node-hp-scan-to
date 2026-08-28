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

- The CLI now exits with a non-zero code when the command fails (previously
  errors were logged but the process still exited `0`), so scripts and
  automated tests can detect failures.