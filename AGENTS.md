# AGENTS.md

Guidelines for agent contributors working on this repository.

## Changelog

- `CHANGELOG.md` documents changes **relative to the last released version**.
- Only list things that were actually shipped in a previous release. Do not
  list "fixes" for bugs that were introduced and never shipped on an
  unmerged branch — those are part of the change being introduced, not fixes.
- Use the `### Added`, `### Changed`, `### Deprecated`, `### Removed`,
  `### Fixed`, `### Security` sections as appropriate, but only for changes
  vs. the last release.

## Communication

- All public communication on this repository (issues, PRs, commit messages,
  changelog, documentation) is done in English.

## Live end-to-end testing

- Main flows (single-scan, listen, adf-autoscan, clear-registrations,
  discover, healthcheck, log formats, debug) can be smoke-tested against a
  real printer with `scripts/live-test.sh`.
- Usage: `pnpm build && SCANNER_IP=<printer-ip> pnpm e2e`
  (`--destructive` also runs `clear-registrations`).
- Any feature that touches a main flow should extend this script so the
  flows stay covered for this and future changes.