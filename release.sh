#!/bin/bash
#
# Prepare a release locally: bump the version, date the changelog, run the
# tests, commit ("chore: release vX.Y.Z") and create an annotated tag.
#
# Usage:
#   ./release.sh [patch|minor|major]
#
# Then push to trigger the Publish workflow:
#   git push origin master --follow-tags
#
# For a fully automated release (no manual push), use the GitHub Actions
# "Release" workflow (workflow_dispatch) instead.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  echo "Error: You must be on 'main' or 'master' branch." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi

VERSION_TYPE="${1:?usage: release.sh [patch|minor|major]}"
case "$VERSION_TYPE" in
  patch|minor|major) ;;
  *) echo "Error: invalid version type '$VERSION_TYPE' (expected patch|minor|major)" >&2; exit 1 ;;
esac

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

echo "Bumping version (no git tag yet)..."
pnpm version "$VERSION_TYPE" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "Error: Tag v$NEW_VERSION already exists." >&2
  exit 1
fi

echo "Dating the changelog for this release..."
TODAY=$(date -u +%Y-%m-%d)
sed -i "0,/^## \[Unreleased\]/s//## [$NEW_VERSION] - $TODAY/" CHANGELOG.md

echo "Running tests..."
pnpm test

echo "Updating commitInfo.json..."
node getCommitId.js

echo "Committing the release..."
git add package.json pnpm-lock.yaml src/commitInfo.json CHANGELOG.md
git commit -m "chore: release v$NEW_VERSION"

echo "Creating annotated tag..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "----------------------------------------"
echo "Release v$NEW_VERSION is ready locally."
echo ""
echo "Push to trigger the Publish workflow (npm, binaries, packages, winget):"
echo "  git push origin $BRANCH --follow-tags"
echo ""
echo "The Publish workflow will:"
echo "- publish to npm"
echo "- build Windows/macOS/Linux binaries and .deb/.rpm/.apk packages, then attach them to the release"
echo "- update the AUR package (once the AUR_SSH_KEY secret is configured, see packaging/arch/PKGBUILD)"
echo "----------------------------------------"