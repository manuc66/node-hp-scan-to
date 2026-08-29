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

## User data

- NEVER delete, move, or modify files in the user's personal scan output
  directories or any folder configured by the user. Scans produced during
  testing belong to the user.
- Cleanup is limited to temporary artifacts you created yourself under
  `/tmp` (e.g. `/tmp/scan-to-pc*`).

## Live end-to-end testing

- Main flows (single-scan, listen, adf-autoscan, clear-registrations,
  discover, healthcheck, log formats, debug) can be smoke-tested against a
  real printer with `scripts/live-test.sh`.
- Usage: `pnpm build && SCANNER_IP=<printer-ip> pnpm e2e`
  (`--destructive` also runs `clear-registrations`).
- Any feature that touches a main flow should extend this script so the
  flows stay covered for this and future changes.

## Releasing

- The release process is documented in `RELEASING.md` (steps to create the
  version commit + tag, either via the `Release` workflow or `release.sh`).
- Release notes (hand-written, replacing the auto-generated commit list) must
  be concise: state the consumer-visible problem factually, then the fix, and
  say what did not change. Internal-only changes go in a short "Under the
  hood" section naming the touched area. See `RELEASING.md` for the full
  style rules and an example.

## Upload / credential testing

- `scripts/upload-stub.mjs` mimics paperless (multipart POST) and Nextcloud
  WebDAV (PROPFIND + PUT) to test upload and credential flows without real
  services. `STUB_FAIL=1` makes every endpoint fail.
- Example against a real scanner:
  `STUB_FAIL=0 node scripts/upload-stub.mjs &`
  `node dist/index.js --address <printer> single-scan --pdf -k \
    --paperless-post-document-url http://localhost:3998/api/documents/post_document/ \
    --paperless-token <token>`
  (replace with `--nextcloud-url/--nextcloud-username/--nextcloud-password`).