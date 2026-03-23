#!/bin/bash

# Script pour automatiser la release de node-hp-scan-to

set -e

# Vérification qu'on est sur master
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "master" ]; then
  echo "Erreur: Vous devez être sur la branche master."
  exit 1
fi

# Vérification des changements non commités
if [ -n "$(git status --porcelain)" ]; then
  echo "Attention: Il y a des changements non commités. Veuillez les commiter ou les stasher."
  # exit 1 # Optionnel, on peut laisser continuer si l'utilisateur sait ce qu'il fait
fi

# Récupération de la version actuelle
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Version actuelle: $CURRENT_VERSION"

# Demander le type de montée de version
echo "Quel type de version voulez-vous produire ?"
select VERSION_TYPE in "patch" "minor" "major"; do
    case $VERSION_TYPE in
        patch|minor|major)
            break
            ;;
        *) echo "Choix invalide";;
    esac
done

# Calcul de la nouvelle version
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
echo "Nouvelle version: $NEW_VERSION"

# Génération des Release Notes
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Génération des release notes depuis $LAST_TAG..."

RELEASE_NOTES_FILE="RELEASE_NOTES.md"
echo "## Release $NEW_VERSION ($(date +%Y-%m-%d))" > $RELEASE_NOTES_FILE
echo "" >> $RELEASE_NOTES_FILE

echo "### Features" >> $RELEASE_NOTES_FILE
git log $LAST_TAG..HEAD --oneline --no-merges --grep="feat" -i | sed 's/^[0-9a-f]* /* /' >> $RELEASE_NOTES_FILE

echo "" >> $RELEASE_NOTES_FILE
echo "### Fixes" >> $RELEASE_NOTES_FILE
git log $LAST_TAG..HEAD --oneline --no-merges --grep="fix" -i | sed 's/^[0-9a-f]* /* /' >> $RELEASE_NOTES_FILE

echo "" >> $RELEASE_NOTES_FILE
echo "### Refactor & Tests" >> $RELEASE_NOTES_FILE
git log $LAST_TAG..HEAD --oneline --no-merges --grep="refactor" --grep="test" -i | sed 's/^[0-9a-f]* /* /' >> $RELEASE_NOTES_FILE

echo "" >> $RELEASE_NOTES_FILE
echo "### Others" >> $RELEASE_NOTES_FILE
git log $LAST_TAG..HEAD --oneline --no-merges --invert-grep --grep="feat" --grep="fix" --grep="Bump" --grep="refactor" --grep="test" -i | sed 's/^[0-9a-f]* /* /' >> $RELEASE_NOTES_FILE

echo "" >> $RELEASE_NOTES_FILE
echo "### Dependency Updates" >> $RELEASE_NOTES_FILE
git log $LAST_TAG..HEAD --oneline --no-merges --grep="Bump" -i | sed 's/^[0-9a-f]* /* /' >> $RELEASE_NOTES_FILE

echo "Release notes générées dans $RELEASE_NOTES_FILE"

# Commit des changements
git add package.json package-lock.json RELEASE_NOTES.md
git commit -m "chore: release $NEW_VERSION"

# Création du tag
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"

echo "--------------------------------------------------"
echo "Release $NEW_VERSION prête localement !"
echo "Prochaines étapes :"
echo "1. Vérifiez le contenu de $RELEASE_NOTES_FILE"
echo "2. Poussez les changements : git push origin master --tags"
echo "3. Pour AUR (https://aur.archlinux.org/packages/node-hp-scan-to) :"
echo "   - Clonez le repo AUR si ce n'est pas fait"
echo "   - Mettez à jour le PKGBUILD avec la nouvelle version ($NEW_VERSION)"
echo "   - Calculez le nouveau checksum (makepkg -g)"
echo "   - Mettez à jour le .SRCINFO (makepkg --printsrcinfo > .SRCINFO)"
echo "   - Commitez et poussez sur AUR"
echo "--------------------------------------------------"
