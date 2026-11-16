# Releasing node-hp-scan-to

## 1. Create the release commit and tag

Two equivalent ways:

- **Automated**: run the `Release` workflow from GitHub (Actions → Release →
  "Run workflow", pick `patch`/`minor`/`major`). It bumps the version, dates
  `CHANGELOG.md`, commits `chore: release vX.Y.Z` and creates an annotated
  tag.
  - If the `RELEASE_PAT` secret is configured, it also pushes master + tag,
    which triggers the `Publish` workflow automatically.
  - Without it, nothing is pushed; push manually (see below).
- **Local**: on `master`, with a clean working tree:
  ```
  ./release.sh patch        # or minor / major
  git push origin master --follow-tags
  ```

Either way, pushing the `vX.Y.Z` tag triggers the `Publish` workflow (npm,
binaries, packages, AUR, and Nix flake hashes update on `master`).

## Code signing

### Windows installer (SignPath)

The `Publish` workflow signs the NSIS installer through SignPath. It requires:

| Name | Kind | Value |
| --- | --- | --- |
| `SIGNPATH_API_TOKEN` | secret | token of a SignPath user with the *submitter* role on both policies |
| `SIGNPATH_ORGANIZATION_ID` | variable | SignPath organization ID; required |
| `SIGNPATH_PROJECT_SLUG` | variable | defaults to `node-hp-scan-to` |

The signing policy is derived from the ref: `test-signing` for a
`workflow_dispatch` run, `release-signing` for a `v*` tag. The artifact
configuration is pinned to `windows-installer`, whose XML is checked in at
`packaging/windows/signpath/artifact-configuration.xml` and must exist in the
SignPath project with that exact slug. The release version is passed to it as
the `version` parameter, and the configuration enforces the `ProductName` /
`ProductVersion` metadata written by `packaging/windows/installer.nsi` (a
SignPath Foundation requirement).

The token is scoped to the dedicated `sign-windows` job, which only downloads
the installer built by `binaries`, signs it, and publishes it. No build, test
or dependency-install step can read it, and the SignPath action is pinned by
commit rather than by tag.

When `SIGNPATH_API_TOKEN` is unset, `sign-windows` publishes the installer
unchanged and it ships unsigned. Once the secret is set, a failing signing
request fails the release instead of silently publishing an unsigned
installer.

Validate the whole signing chain without publishing:

```bash
gh workflow run publish.yml --ref master
gh run watch
gh run download <run-id> -n release-test -D /tmp/scan-to-pc-release-test
osslsigncode verify \
  -in /tmp/scan-to-pc-release-test/setup-node-hp-scan-to-v0.0.0-dispatch.exe
```

A tag run uses `release-signing`, which SignPath Foundation requires to be
approved manually. The certificate is issued by SignPath Foundation; while it
is still in `CSR PENDING` state, the policy is `INVALID` and only
`test-signing` can be used.

### macOS packages

`scripts/build-macos-packages.sh` signs the `.app`, `.pkg` and `.dmg` and
notarizes them when the `MACOS_*` secrets are set: `MACOS_CERT_BASE64`,
`MACOS_CERT_PASSWORD`, `MACOS_SIGNING_IDENTITY`, `MACOS_INSTALLER_IDENTITY`,
`MACOS_NOTARY_APPLE_ID`, `MACOS_NOTARY_APPLE_PASSWORD`, `MACOS_NOTARY_TEAM_ID`.
Without them the packages are built unsigned and un-notarized.

## 2. Write the release note

The Publish workflow generates a bare commit-list note; **replace it** with a
hand-written one. Style rules:

- **Be concise.** Two short sections max. No filler, no fluff.
- **State the consumer-visible problem factually, then the fix.** Name the
  symptom a user actually sees (error message, crash, wrong output), then one
  line on how it was fixed. Say what did *not* change, and which modes were
  never affected.
- **Under the hood** changes (no user-visible effect) go in a short
  "Under the hood" section: name the area touched (workflow, scripts, tests)
  and explicitly say there is no behaviour change to the shipped binaries
  when that is the case.
- Do not list release assets or paste the full changelog link; the GitHub UI
  already shows the assets.
- Write in English (all public communication on this repository is English).

Example:

```
## v1.11.1

### Fixed

- **Standalone executables crashed on startup in a terminal** (interactive
  `listen`/`single-scan`/…). Running the binary from a terminal exited
  immediately with `unable to determine transport target for "pino-pretty"`.
  Fixed by running pino-pretty in-process in Bun-compiled executables.
  Terminal output is unchanged. Service/background modes (systemd, launchd,
  Docker, Windows installer) were never affected. (#1687, #1688)

### Under the hood

- **Automated releases**: new `Release` workflow (manual trigger) bumps the
  version, dates the changelog, commits and tags; `release.sh` rewritten to
  match. No behaviour change to the shipped binaries.
- **Tests**: the Bun pretty-mode crash is now covered by a unit test and a
  Bun-compiled integration test.
```