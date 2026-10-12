# AGENTS

Guidelines for collaborators and AI assistants working on this repository.

## Scope
This file applies to the entire repository. Create additional `AGENTS.md` files in subdirectories for module-specific conventions.

## Communication
- Be concise and use clear language.
- Ask clarifying questions when instructions are ambiguous.
- Reference relevant files or command output with citations.

## Writing issues, pull requests, and release notes
- Lead with the user problem and the final observable outcome. Describe what ships and why it helps, rather than narrating development steps or listing helper modules.
- Start issues with a short problem/outcome paragraph and an actionable checklist. Keep current scope and acceptance criteria accurate; preserve superseded decisions and detailed design, review, and verification evidence in linked issue comments.
- Before creating or updating a pull request, read `.github/pull_request_template.md` and complete its sections. Recheck the title, release notes, and upgrade actions against the final diff after meaningful scope changes and before review.
- Target 150–250 words for a PR description; use more only when complexity warrants it. Include implementation details only when they help assess correctness, compatibility, security, or deployment. Link detailed evidence instead of repeating test inventories, intermediate designs, or review history.
- Write one to three short release-note bullets describing final user-visible changes (roughly 30 words each). For fixes, describe the trigger and corrected behavior. Do not present fixes to an unreleased feature, CI setup, or intermediate implementations as separate product improvements.
- Use `Internal only.` in the release-notes section for maintenance without user-facing impact. Features and breaking changes require actual release notes. Dependabot's non-breaking `chore(deps...)` PRs are the sole template exception; dependency fixes and breaking updates follow the normal contract.
- List required commands, settings, migrations, and material deployment limitations under upgrade actions; write `None.` when no action is required. Summarize validation with command names and concise results, and link the tracking issue. Breaking PR titles also require a `BREAKING CHANGE:` footer because the existing version analyzer uses that footer.
- When replacing an earlier, still-unreleased PR's notes, add `<!-- replaces-release-notes: #NUMBER -->` (comma-separated numbers for multiple PRs). Restate retained behavior and all applicable upgrade actions in the replacement. Do not replace notes for an already-released PR.
- Run `npm run pr:check -- --event PATH` with a PR event JSON file and `npm run release:preview -- --from REF --to REF --candidate-event PATH` before review. Resolve metadata errors and inspect the preview for accuracy; structural checks cannot judge prose quality.

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
- Prefer squash merging when a human explicitly authorizes a merge. Use the Conventional Commit PR title and the completed PR body for the squash message; preserve legitimate closing references and `BREAKING CHANGE:` footers. Keep useful local development commits; do not rewrite another checkout's history or merge automatically.
- Select the PR title's Conventional Commit type for the complete final change, with the highest applicable release impact. Do not classify a standalone user-facing fix as internal maintenance.
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
