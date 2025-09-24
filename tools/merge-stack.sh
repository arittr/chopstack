#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <top-pr-number>" >&2
  exit 1
fi

TOP_PR="$1"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
OWNER="${REPO%/*}"
NAME="${REPO#*/}"
DEFAULT_BRANCH="$(gh api repos/"$REPO" --jq '.default_branch')"

if [[ -z "${GH_TOKEN:-}" ]]; then
  if ! gh auth status >/dev/null 2>&1; then
    echo "Authenticate gh CLI or set GH_TOKEN before running" >&2
    exit 1
  fi
else
  export GITHUB_TOKEN="$GH_TOKEN"
fi

git config --global user.name "${GIT_COMMITTER_NAME:-Stack Merge Bot}"
git config --global user.email "${GIT_COMMITTER_EMAIL:-stack-merge-bot@users.noreply.github.com}"

if [[ -n "${GH_TOKEN:-}" ]]; then
  git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git"
else
  gh auth setup-git >/dev/null 2>&1 || true
fi

git fetch origin "$DEFAULT_BRANCH"
git checkout -B "$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"

STACK=()
current="$TOP_PR"
while true; do
  STACK+=("$current")
  base_ref=$(gh pr view "$current" --repo "$REPO" --json baseRefName --jq '.baseRefName')
  if [[ "$base_ref" == "$DEFAULT_BRANCH" ]]; then
    break
  fi
  next_pr=$(gh api graphql \
    -f owner="$OWNER" \
    -f name="$NAME" \
    -f headRefName="$base_ref" \
    -f query='query($owner:String!, $name:String!, $headRefName:String!){repository(owner:$owner, name:$name){pullRequests(headRefName:$headRefName, states:OPEN, first:1){nodes{number}}}}' \
    --jq '.data.repository.pullRequests.nodes[0].number // empty')
  if [[ -z "$next_pr" ]]; then
    echo "Base branch $base_ref does not have an open PR; stopping at #$current" >&2
    break
  fi
  current="$next_pr"
done

reverse_stack=()
for (( idx=${#STACK[@]}-1; idx>=0; idx-- )); do
  reverse_stack+=("${STACK[$idx]}")
done

if [[ ${#reverse_stack[@]} -eq 0 ]]; then
  echo "No PRs found for stack" >&2
  exit 1
fi

pr_list=$(printf '#%s ' "${reverse_stack[@]}")
gh pr comment "$TOP_PR" --repo "$REPO" --body ":robot: Stack merge started for PRs ${pr_list}" || true

merge_mode="${MERGE_METHOD:-rebase}"
case "$merge_mode" in
  merge|squash|rebase) ;;
  *)
    echo "Unsupported MERGE_METHOD: $merge_mode" >&2
    exit 1
    ;;
esac

for pr in "${reverse_stack[@]}"; do
  pr_data=$(gh pr view "$pr" --repo "$REPO" --json headRefName,baseRefName,state)
  branch=$(jq -r '.headRefName' <<<"$pr_data")
  base=$(jq -r '.baseRefName' <<<"$pr_data")
  state=$(jq -r '.state' <<<"$pr_data")
  if [[ "$state" != "OPEN" ]]; then
    echo "Skipping PR #$pr because it is $state" >&2
    continue
  fi

  echo "::group::Rebasing and merging PR #$pr ($branch <- $base)"
  git fetch origin "$branch"
  git checkout -B "$branch" "origin/$branch"
  git fetch origin "$DEFAULT_BRANCH"

  if ! git rebase "origin/$DEFAULT_BRANCH"; then
    git rebase --abort || true
    msg=":x: Failed to rebase #$pr ($branch) onto $DEFAULT_BRANCH. Resolve conflicts manually and re-run the stack merge."
    gh pr comment "$pr" --repo "$REPO" --body "$msg"
    exit 1
  fi

  git push --force-with-lease origin "$branch"

  if [[ "$base" != "$DEFAULT_BRANCH" ]]; then
    gh pr edit "$pr" --repo "$REPO" --base "$DEFAULT_BRANCH"
  fi

  # Wait for checks, but don't fail if no checks are configured
  if ! gh pr checks "$pr" --repo "$REPO" --watch 2>/dev/null; then
    # Check if there are actually any checks configured
    check_count=$(gh pr checks "$pr" --repo "$REPO" --json conclusion 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")
    if [[ "$check_count" != "0" ]]; then
      msg=":warning: Required checks failed for #$pr after rebasing. Inspect the run, fix the issues, and re-run the stack merge."
      gh pr comment "$pr" --repo "$REPO" --body "$msg"
      exit 1
    else
      echo "No checks configured for PR #$pr, proceeding with merge..."
    fi
  fi

  # Wait for GitHub to update mergeable status after rebase
  echo "Waiting for GitHub to update mergeable status..."
  for attempt in {1..30}; do
    mergeable=$(gh pr view "$pr" --repo "$REPO" --json mergeable --jq '.mergeable')
    if [[ "$mergeable" == "MERGEABLE" ]]; then
      break
    fi
    echo "Attempt $attempt/30: PR not yet mergeable, waiting 2 seconds..."
    sleep 2
  done

  if [[ "${KEEP_BRANCHES:-}" == "true" ]]; then
    if ! gh pr merge "$pr" --repo "$REPO" --"$merge_mode"; then
      msg=":x: GitHub refused to merge #$pr. Please merge manually and restart the stack merge from the next PR."
      gh pr comment "$pr" --repo "$REPO" --body "$msg"
      exit 1
    fi
  else
    if ! gh pr merge "$pr" --repo "$REPO" --"$merge_mode" --delete-branch; then
      msg=":x: GitHub refused to merge #$pr. Please merge manually and restart the stack merge from the next PR."
      gh pr comment "$pr" --repo "$REPO" --body "$msg"
      exit 1
    fi
  fi

  git checkout "$DEFAULT_BRANCH"
  echo "::endgroup::"
done

gh pr comment "$TOP_PR" --repo "$REPO" --body ":white_check_mark: Stack merge completed." || true
