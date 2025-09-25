# Stack Merge Automation

This repository includes a GitHub Actions workflow that mimics a "merge stack" button for stacks created with [git-spice](https://abhinav.github.io/git-spice/). The action follows labels and branch relationships to merge a stack of pull requests from bottom to top without manual babysitting.

## What It Does

- Detects the stack chain automatically by walking each PR's base branch until it hits the repository default branch.
- Rebases every branch in the stack onto the latest default branch as it goes, so each PR diff stays scoped to its own changes.
- Waits for required status checks to finish after the rebase, then merges the PR.
- Repeats until the entire stack has landed, commenting on progress as it runs.
- Automatically mirrors new git-spice behaviour: worktree commits are synced back before branch creation and conflicts are auto-resolved (when the repo opts into the `auto` strategy), so the action observes the same stack topology you see locally.

## One-Time Setup

1. **Authentication**  
   The workflow defaults to the built-in `GITHUB_TOKEN`, so no additional credentials are required. If you prefer to run the script from another context (or need cross-repo access) you can still add a classic PAT as the optional `STACK_MERGE_TOKEN` secret—it will be picked up automatically when present.

2. **(Optional) Change merge behaviour**  
   The script honours two environment variables:
   - `MERGE_METHOD` — one of `merge`, `squash`, or `rebase` (defaults to `merge`).
   - `KEEP_BRANCHES` — set to `true` to skip deleting branches after merge.
   Update `.github/workflows/stack-merge.yml` if you want to set either of these globally.

3. **Keep stacks linear locally**  
   Continue using `gs stack restack` / `gs stack submit` to ensure each PR base reflects the intended order before you trigger the workflow.

## Daily Use

- **Command trigger**: comment `/stack-merge` on the *topmost* PR in the stack once every PR in the stack is green.  
- **Manual trigger**: run the "Stack Merge Queue" workflow manually from the Actions tab and pass the top PR number.

The workflow will post status comments on the PR thread while it processes the stack. If it encounters a rebase conflict or a failing check it leaves a descriptive comment on the specific PR and stops so you can fix things locally.

> 💡 Running the script outside Actions? Make sure the `gh` CLI is logged in (`gh auth login`) or export a `GH_TOKEN` before executing `tools/merge-stack.sh` directly.

## Constraints & Caveats

- Works only for stacks within the same repository (fork-based PRs are not supported).
- Assumes required checks exist and are enforceable through `gh pr checks --watch` — if you rely on non-standard CI integrations you may need additional steps.
- If a rebase conflict occurs, resolve it locally with `gs stack restack` and re-submit before re-running the workflow.
- The workflow runs under a `stack-merge` concurrency group so only one stack is processed at a time.

With this in place you can keep using `git-spice` for submitting stacks, but rely on GitHub Actions to finish the job once the stack is ready.
