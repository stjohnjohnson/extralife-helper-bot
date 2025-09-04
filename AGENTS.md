# AGENTS

Guidelines for collaborators and AI assistants working on this repository.

## Scope
This file applies to the entire repository. Create additional `AGENTS.md` files in subdirectories for module-specific conventions.

## Communication
- Be concise and use clear language.
- Ask clarifying questions when instructions are ambiguous.
- Reference relevant files or command output with citations.

## Development environment
- Requires Node.js 24 or later.
- Install dependencies with `npm install`.
- Use `.env` based on `env.example` for local runs. Never commit secrets.

## Testing and linting
- Run `npm run lint` and `npm test` before committing.
- Ensure tests pass and lint is clean.
- Add or update tests when modifying code.

## Commit and PR guidelines
- Commit messages: short, imperative style, e.g., "Add command handler".
- Leave the working tree clean (`git status` shows no changes) before finishing.
- PR titles: use [Conventional Commits](https://www.conventionalcommits.org/) format, e.g., `docs: add AGENTS guidelines`.
- In PR descriptions, summarize changes and list test commands executed.
