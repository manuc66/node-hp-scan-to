#!/bin/bash

# Script to automate the release process for node-hp-scan-to

set -e

echo "Starting release process..."

# Ensure we are on main or master
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  echo "Error: You must be on 'main' or 'master' branch."
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: There are uncommitted changes."
  read -p "Do you want to continue anyway? (y/n): " CONTINUE
  if [[ "$CONTINUE" != "y" ]]; then
    echo "Aborting."
    exit 1
  fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Ask for version bump type
echo "Select version bump type:"
select VERSION_TYPE in "patch" "minor" "major"; do
  case $VERSION_TYPE in
    patch|minor|major)
      break
      ;;
    *)
      echo "Invalid choice"
      ;;
  esac
done

# Compute new version (without git tag)
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
NEW_VERSION=${NEW_VERSION#v}
echo "New version: $NEW_VERSION"

# Ensure tag does not already exist
if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "Error: Tag v$NEW_VERSION already exists."
  exit 1
fi

# Run tests before proceeding
echo "Running tests..."
npm test

# Get last tag (if exists)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
RANGE=${LAST_TAG:+$LAST_TAG..HEAD}

if [ -z "$LAST_TAG" ]; then
  echo "No previous tag found, generating full history."
else
  echo "Generating release notes since $LAST_TAG..."
fi

RELEASE_NOTES_FILE="RELEASE_NOTES.md"

{
  echo "## Release v$NEW_VERSION ($(date +%Y-%m-%d))"
  echo ""

  echo "### Features"
  git log $RANGE --oneline --no-merges --grep="feat" -i | sed 's/^[0-9a-f]* /* /'
  echo ""

  echo "### Fixes"
  git log $RANGE --oneline --no-merges --grep="fix" -i | sed 's/^[0-9a-f]* /* /'
  echo ""

  echo "### Refactor & Tests"
  git log $RANGE --oneline --no-merges --grep="refactor\|test" -i | sed 's/^[0-9a-f]* /* /'
  echo ""

  echo "### Dependency Updates"
  git log $RANGE --oneline --no-merges --grep="bump" -i | sed 's/^[0-9a-f]* /* /'
  echo ""

  echo "### Others"
  git log $RANGE --oneline --no-merges \
    --invert-grep --grep="feat" --grep="fix" --grep="refactor" --grep="test" --grep="bump" -i \
    | sed 's/^[0-9a-f]* /* /'
  echo ""
} > "$RELEASE_NOTES_FILE"

echo "Release notes generated in $RELEASE_NOTES_FILE"

# Commit changes
git add package.json package-lock.json RELEASE_NOTES.md
git commit -m "chore: release v$NEW_VERSION"

# Create tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "----------------------------------------"
echo "Release v$NEW_VERSION is ready locally."
echo ""

# Optional push
read -p "Do you want to push changes and tags now? (y/n): " PUSH
if [[ "$PUSH" == "y" ]]; then
  git push origin "$BRANCH" --tags
  echo "Changes pushed."
else
  echo "You can push later with:"
  echo "git push origin $BRANCH --tags"
fi

echo ""
echo "Next steps for AUR (https://aur.archlinux.org/packages/node-hp-scan-to):"
echo "- Update PKGBUILD with version $NEW_VERSION"
echo "- Update checksum (makepkg -g)"
echo "- Update .SRCINFO (makepkg --printsrcinfo > .SRCINFO)"
echo "- Commit and push to AUR"
echo "----------------------------------------"