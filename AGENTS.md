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
