# AGENTS

Guidelines for collaborators and AI assistants working on this repository.

## Scope
This file applies to the entire repository. Create additional `AGENTS.md` files in subdirectories for module-specific conventions.

## Communication
- Be concise and use clear language.
- Ask clarifying questions when instructions are ambiguous.
- Reference relevant files or command output with citations.

## Git worktree workflow
- Before starting repository work, fetch `origin/main`. Fast-forward a clean primary `main` checkout with `git pull --ff-only origin main`; preserve local changes and report any divergence.
- Create new task worktrees from the freshly fetched `origin/main`. Do not automatically merge or rebase `main` into existing task branches.
- Perform all repository work in an isolated git worktree on a task-specific branch, using the `codex/` prefix. Never edit the primary checkout or work directly on `main`.
- Reuse a suitable task worktree or create one from the latest `origin/main` before editing files. Prefer the native worktree tools when available.
- Preserve unrelated changes in other checkouts and worktrees; never discard or include them in task commits.

## Issue-based planning and tracking
- When task planning begins, create a GitHub issue in this repository or reuse the issue already tracking the task. Start the issue during brainstorming; do not wait until the design or implementation plan is finished. Share the issue link with the user.
- Use the issue as the canonical record for the goal, scope, design, decisions and trade-offs, acceptance criteria, and implementation plan. Keep actionable tasks in a checklist in the issue body.
- Update the issue as planning and implementation progress: revise the current plan and check off completed tasks in the body, and add comments for meaningful decisions, scope changes, blockers, review findings, and verification results. Preserve useful decision history rather than silently replacing it.
- Apply this workflow to Superpowers brainstorming, writing-plans, execution, review, and handoff artifacts. When a skill requests a Markdown design or plan file, saving or committing that artifact, or a file path for a handoff, use the tracking issue and its relevant comment links instead. The issue replaces the document destination; keep the skill's applicable design, approval, execution, and verification steps.
- If GitHub access prevents creating or updating the issue, report the blocker promptly. Keep any temporary notes local and untracked, and publish them to the issue when access is restored.
- Put implementation changes, tests, and lasting project documentation in the pull request. Link the tracking issue in the PR description; use `Closes #<number>` when the PR completes the issue, or a non-closing reference when work remains. Record the PR link and final verification results in the issue. Leave the issue open until the work is merged or the user explicitly asks to close it.

## Local planning artifacts
- Optional local design documents, implementation plans, and Superpowers artifacts are scratch copies of the issue, not the source of truth. Keep them untracked in ignored `plans/`, `superpowers/`, or `.superpowers/` directories, or outside the repository.
- Do not commit these artifacts, force-add ignored files, or relocate them to bypass `.gitignore`. This applies even when a skill requests saving or committing a plan.
- Before committing, check the staged file list and exclude any planning or Superpowers artifacts.

## Development environment
- Requires Node.js 24.x (24.15.0 or newer).
- Install dependencies with `npm ci`.
- Use `.env` based on `env.example` for local runs. Never commit secrets.

## Testing and linting
- Run `npm run lint` and `npm test` before committing.
- All tests must pass and lint must be clean before committing or opening a merge request. Run the complete test suite; do not skip, disable, or weaken tests to obtain a passing result.
- Resolve failures before proceeding. If verification cannot complete, report the blocker and do not claim completion.
- After opening the merge request, check required CI results and resolve failures before considering the task complete.
- Add or update tests when modifying code.

## Automated commits and merge requests
- Automatically commit completed, verified work without asking for commit approval. Stage only files belonging to the task.
- Push the task branch and open a merge request against `main` as the final deliverable. On GitHub, this is a pull request. Do not merge it unless explicitly instructed.
- If a merge request already exists for the task branch, update it instead of creating a duplicate.
- **Commit messages**: Use [Conventional Commits](https://www.conventionalcommits.org/) format for all commits:
  - Format: `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
  - Examples: 
    - `feat: add voice channel management with admin permissions`
    - `fix: resolve Discord authentication timeout`
    - `docs: update README with admin setup instructions`
- **Implementation commits**: When implementing features, provide detailed commit messages that include:
  - Clear description of the feature/change
  - Technical implementation details
  - Security considerations (if applicable)
  - Configuration requirements
  - Cross-platform impacts
- Leave the task worktree clean (`git status` shows no changes) before finishing; preserve pre-existing changes in other checkouts.
- Merge request titles: use [Conventional Commits](https://www.conventionalcommits.org/) format, e.g., `docs: add AGENTS guidelines`.
- In merge request descriptions, summarize changes and list test commands executed.
