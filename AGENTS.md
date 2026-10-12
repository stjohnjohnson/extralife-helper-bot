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
- Start issues with a short problem/outcome paragraph, current status, and one actionable checklist. Keep scope, acceptance criteria, and blockers current; link the maintained planning comment for design and implementation details. Follow the issue-tracking structure below.
- Before creating or updating a pull request, read `.github/pull_request_template.md` and complete its sections. Recheck the title, release notes, and upgrade actions against the final diff after meaningful scope changes and before review.
- Target 150–250 words for a PR description; use more only when complexity warrants it. Include implementation details only when they help assess correctness, compatibility, security, or deployment. Link detailed evidence instead of repeating test inventories, intermediate designs, or review history.
- Write one to three short release-note bullets describing final user-visible changes (roughly 30 words each). For fixes, describe the trigger and corrected behavior. Do not present fixes to an unreleased feature, CI setup, or intermediate implementations as separate product improvements.
- Use `Internal only.` in the release-notes section for maintenance without user-facing impact. Features and breaking changes require actual release notes. Dependabot's non-breaking `chore(deps...)` PRs are the sole template exception; dependency fixes and breaking updates follow the normal contract.
- List required commands, settings, migrations, and material deployment limitations under upgrade actions; write `None.` when no action is required. Summarize validation with command names and concise results, and link the tracking issue. Breaking PR titles also require a `BREAKING CHANGE:` footer because the existing version analyzer uses that footer.
- When replacing an earlier, still-unreleased PR's notes, add `<!-- replaces-release-notes: #NUMBER -->` (comma-separated numbers for multiple PRs). Restate retained behavior and all applicable upgrade actions in the replacement. Do not replace notes for an already-released PR.
- Review the release notes and upgrade actions against the final diff before requesting review. The release tool reads these PR sections; writing quality is an agent and reviewer responsibility.

## Git worktree workflow
- Before starting repository work, fetch `origin/main`. Fast-forward a clean primary `main` checkout with `git pull --ff-only origin main`; preserve local changes and report any divergence.
- Create new task worktrees from the freshly fetched `origin/main`. Do not automatically merge or rebase `main` into existing task branches.
- Perform all repository work in an isolated git worktree on a task-specific branch, using the `codex/` prefix. Never edit the primary checkout or work directly on `main`.
- Reuse a suitable task worktree or create one from the latest `origin/main` before editing files. Prefer the native worktree tools when available.
- Preserve unrelated changes in other checkouts and worktrees; never discard or include them in task commits.

## Issue-based planning and tracking
- When task planning begins, create a GitHub issue in this repository or reuse the issue already tracking the task. Start the issue during brainstorming; do not wait until the design or implementation plan is finished. Share the issue link with the user.
- Keep GitHub Issues as the canonical home for plans and implementation notes. Use the body for the current goal, scope, status, acceptance criteria, blockers, and one actionable checklist. Update that checklist as work progresses.
- Keep the approved design, important decisions and trade-offs, and implementation details needed to resume work in one maintained planning comment linked from the body. Edit that comment as the plan changes; collapse longer details with `<details>` and a descriptive `<summary>`. Keep execution checklists in the body rather than duplicating them in comments.
- Add comments for consequential decisions with their rationale, scope changes, actionable blockers, or material review findings. Preserve useful decision history briefly before replacing superseded plans; keep the body and planning comment focused on the current agreement. Routine execution updates, passing checks, commits, environment setup, and clean-worktree reports belong in chat rather than separate issue comments.
- Apply this structure to Superpowers brainstorming, writing-plans, execution, review, and handoff artifacts. Summarize their useful content into the maintained planning comment instead of copying entire artifacts or adding a comment for each phase. The issue replaces requested Markdown design/plan files and handoff destinations; retain applicable design, approval, execution, and verification steps. Preserve enough context to resume the work without the original chat.
- If GitHub access prevents creating or updating the issue, report the blocker promptly. Keep temporary notes local and untracked, and reconcile relevant decisions and current planning into the issue when access is restored.
- Put implementation changes, tests, and lasting project documentation in the pull request. Link the tracking issue in the PR description; use `Closes #<number>` when the PR completes the issue, or a non-closing reference when work remains. Batch final delivery into one issue comment with the PR link, tested commit, concise verification results, and outstanding work or limitations; link CI or other evidence instead of repeating logs and test inventories. Update that delivery comment if final verification changes. Leave the issue open until the work is merged or the user explicitly asks to close it.

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
  - Types: `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `refactor`, `test`, `chore`
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
