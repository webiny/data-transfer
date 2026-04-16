#!/usr/bin/env zsh
set -euo pipefail

TARGET_BRANCH="bruno/merging-main-into-di"
MAIN_REF="origin/main"

echo "==> Verifying current branch..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
  echo "Error: You are on '$CURRENT_BRANCH', expected '$TARGET_BRANCH'."
  exit 1
fi

echo "==> Verifying clean working tree..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash first."
  git status --short
  exit 1
fi

echo "==> Capturing pre-merge tree..."
PRE_TREE="$(git rev-parse HEAD^{tree})"
PRE_HEAD="$(git rev-parse --short HEAD)"

echo "==> Fetching latest refs..."
git fetch origin

echo "==> Creating safety tag..."
TAG_NAME="backup/${TARGET_BRANCH//\//-}-before-ours-merge-$(date +%Y%m%d-%H%M%S)"
git tag -a "$TAG_NAME" -m "Backup before ours-merge of $MAIN_REF into $TARGET_BRANCH"

echo "==> Merging $MAIN_REF with ours strategy (keep branch files)..."
git merge -s ours --no-ff "$MAIN_REF" -m "Merge $MAIN_REF into $TARGET_BRANCH (ours strategy: keep branch content)"

echo "==> Verifying file tree unchanged..."
POST_TREE="$(git rev-parse HEAD^{tree})"
if [[ "$PRE_TREE" != "$POST_TREE" ]]; then
  echo "Error: Tree changed unexpectedly."
  echo "Pre:  $PRE_TREE"
  echo "Post: $POST_TREE"
  exit 1
fi

echo "==> Verifying merge commit parents..."
PARENTS=("${(@s: :)$(git show -s --format=%P HEAD)}")
if [[ "${#PARENTS[@]}" -ne 2 ]]; then
  echo "Error: HEAD is not a 2-parent merge commit."
  exit 1
fi

MAIN_SHA="$(git rev-parse "$MAIN_REF")"
if [[ "${PARENTS[2]}" != "$MAIN_SHA" ]]; then
  echo "Warning: Second parent is not $MAIN_REF."
  echo "Parents: ${PARENTS[*]}"
  echo "Main:    $MAIN_SHA"
fi

echo "==> Success."
echo "Previous HEAD: $PRE_HEAD"
echo "Backup tag:    $TAG_NAME"
echo
git --no-pager log --oneline --graph -n 5

