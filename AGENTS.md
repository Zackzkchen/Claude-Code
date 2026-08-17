# Repository Guidelines

## Project Structure & Module Organization
Core source lives in `src/`. Entry points and CLI wiring are under files such as `src/dev-entry.ts`, `src/main.tsx`, and `src/commands.ts`. Feature code is grouped by area in folders like `src/commands/`, `src/services/`, `src/components/`, `src/tools/`, and `src/utils/`. Restored or compatibility code also appears in `vendor/` and local package shims in `shims/`. There is no dedicated `test/` directory in the restored tree today; treat focused validation near the changed module as the default.

## Build, Test, and Development Commands
Use Bun for local development.

- `bun install`: install dependencies and local shim packages.
- `bun run dev`: start the restored CLI entrypoint interactively.
- `bun run start`: alias for the development entrypoint.
- `bun run version`: verify the CLI boots and prints its version.

If you change TypeScript modules, run the relevant command above and verify the affected flow manually. This repository does not currently expose a first-class `lint` or `test` script in `package.json`.

## Coding Style & Naming Conventions
The codebase is TypeScript-first with ESM imports and `react-jsx`. Match the surrounding file style exactly: many files omit semicolons, use single quotes, and prefer descriptive camelCase for variables and functions, PascalCase for React components and manager classes, and kebab-case for command folders such as `src/commands/install-slack-app/`. Keep imports stable when comments warn against reordering. Prefer small, focused modules over broad utility dumps.

## Testing Guidelines
There is no consolidated automated test suite configured at the repository root yet. For contributor changes, use targeted runtime checks:

- boot the CLI with `bun run dev`
- smoke-test version output with `bun run version`
- exercise the specific command, service, or UI path you changed

When adding tests, place them close to the feature they cover and name them after the module or behavior under test.

## Commit & Pull Request Guidelines
Git history currently starts with a single `first commit`, so no strong conventional pattern is established. Use short, imperative commit subjects, for example `Fix MCP config normalization`. Pull requests should explain the user-visible impact, note restoration-specific tradeoffs, list validation steps, and include screenshots only for TUI/UI changes.

## Restoration Notes
This is a reconstructed source tree, not pristine upstream. Prefer minimal, auditable changes, and document any workaround added because a module was restored with fallbacks or shim behavior.

## Cursor Cloud specific instructions
Durable notes for running this restored Claude Code CLI in the Cloud Agent VM. Standard commands live in "Build, Test, and Development Commands" above; this section only records non-obvious gotchas.

- Runtime is Bun `1.3.5` (pinned via `packageManager`), installed at `/usr/local/bin/bun`. Dependencies refresh with `bun install` (the startup update script). The repo's `engines.node >= 24` is not enforced because everything runs through Bun, not Node; the base image's Node version does not matter for `bun run *`.
- `bun run dev` launches a full-screen Ink (React) TUI that requires a real TTY (raw mode). In a plain non-interactive shell it fails with "Raw mode is not supported on the current process.stdin". Run it under tmux or a desktop terminal. Any Ink-rendering command (the REPL, `doctor`) needs a TTY.
- Non-interactive subcommands do NOT need a TTY or auth and are the fastest smoke tests: `bun run dev --version`, and MCP management like `bun run dev mcp add <name> -- <cmd>`, `bun run dev mcp list`, `bun run dev mcp get <name>`, `bun run dev mcp remove <name> -s local`. These persist to `~/.claude.json`.
- The chat REPL requires Anthropic auth (subscription OAuth or a Console API key). Onboarding/auth state lives in `~/.claude.json` (`theme`, `hasCompletedOnboarding`). Once `hasCompletedOnboarding` is set, `bun run dev` boots straight into the REPL showing "Not logged in · Run /login" instead of the blocking login selector; you can navigate the UI and run slash/CLI commands, but sending model messages needs valid credentials (set `ANTHROPIC_API_KEY` or run `/login`).
- There are no `lint` or `test` scripts; validate changes by running the affected command/flow as noted above.
