#!/bin/bash

# Script to automate the release process for node-hp-scan-to (Yarn + GitHub releases)

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

# Compute new version (pnpm way)
echo "Bumping version..."
pnpm version $VERSION_TYPE
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Ensure tag does not already exist
if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "Error: Tag v$NEW_VERSION already exists."
  exit 1
fi

# Install dependencies cleanly
echo "Installing dependencies (clean)..."
rm -rf node_modules
pnpm install

# Run tests
echo "Running tests..."
pnpm test

# Generate commit info
echo "Updating commitInfo.json..."
node getCommitId.js

# Commit changes (if any files were modified by getCommitId or pnpm version)
git add package.json pnpm-lock.yaml src/commitInfo.json
if ! git diff --cached --quiet; then
  git commit -m "chore: release v$NEW_VERSION"
fi

# Create tag (yarn version might have created one, let's check)
if ! git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
fi

echo "----------------------------------------"
echo "Release v$NEW_VERSION is ready locally."
echo ""

# Push step
read -p "Do you want to push changes and tags now? (y/n): " PUSH
if [[ "$PUSH" == "y" ]]; then
  git push origin "$BRANCH" --tags
  echo "Changes pushed."

  echo ""
  echo "Next step:"
  echo "→ Go to GitHub and create a release from tag v$NEW_VERSION"
  echo "→ Use 'Generate release notes' button"
else
  echo "You can push later with:"
  echo "git push origin $BRANCH --tags"
fi

echo ""
echo "AUR steps (https://aur.archlinux.org/packages/node-hp-scan-to):"
echo "- Update PKGBUILD with version $NEW_VERSION"
echo "- Update checksum (makepkg -g)"
echo "- Update .SRCINFO (makepkg --printsrcinfo > .SRCINFO)"
echo "- Commit and push to AUR"
echo "----------------------------------------"