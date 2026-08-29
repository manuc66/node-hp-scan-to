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
binaries, packages, AUR).

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