<!-- GSD:project-start source:PROJECT.md -->
## Project

**agno-cli**

A Node.js/TypeScript CLI for managing and interacting with Agno AgentOS instances. Built directly on top of the `@worksofadam/agentos-sdk`, it provides full coverage of the AgentOS API — agents, teams, workflows, sessions, traces, knowledge, memories, evals, metrics, schedules, approvals, and more. Designed for both human operators and AI agent automation, with chaining and scripting capabilities that let users pipe commands together (e.g., list agents → get agent details → run agent).

**Core Value:** Complete, scriptable CLI access to every AgentOS API capability — enabling both interactive management and automated pipelines built on command chaining.

### Constraints

- **Tech stack**: Node.js + TypeScript, must use `@worksofadam/agentos-sdk` as the API layer
- **CLI framework**: To be determined during research (Commander.js, oclif, yargs, or similar)
- **Config format**: YAML config at `~/.agno/config.yaml` (match reference CLI convention)
- **Installation**: npm package installable as `agno` global command
- **Node.js**: 18+ (SDK requirement)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | >=20.0.0 | Runtime | Node 18 reached EOL April 2025. Node 20 is current LTS (active until April 2026, maintenance until April 2027). Commander 14 and ESM-only packages (ora, chalk) all require Node 20+. Aligning with 20+ avoids compatibility friction. Update SDK engines field from >=18 to >=20 when ready. |
| TypeScript | ^5.7 | Type safety | Aligns with SDK (^5.7.2). Use `"module": "node16"` and `"moduleResolution": "node16"` in tsconfig for correct ESM resolution. |
| Commander.js | ^14.0 | CLI framework | 500M weekly downloads, 0 dependencies, 18ms startup, auto-generated help, nested subcommands, TypeScript types included. The right choice for a CLI wrapping 16 resource namespaces -- lightweight, fast, well-understood. See "Alternatives Considered" for detailed rationale. |
| tsup | ^8.5 | Build/bundle | Aligns with SDK build tooling. Zero-config TypeScript bundler powered by esbuild. Handles ESM output, dts generation, shims for `__dirname`/`__filename` in ESM, and shebang insertion via `banner`. |
### YAML & Config
| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| yaml | ^2.8 | YAML parse/stringify | Full YAML 1.2 spec, proper AST support for comments/formatting preservation (critical for config files users may hand-edit), TypeScript types included, 119M weekly downloads, actively maintained (2.8.3 released March 2026). |
### Output Formatting
| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| cli-table3 | ^0.6.5 | Table output | Unicode table rendering for human-readable list/detail views. Supports column spanning, cell styling, text wrapping, ANSI color in cells. Used by npm CLI itself. 4,750 dependents. Stable API (0.6.5 published May 2024) -- "boring" is good for a utility like this. |
| chalk | ^5.6 | Terminal colors | ESM-only (fine for our ESM project). Expressive chaining API (`chalk.bold.red()`), auto color detection, 256/Truecolor support, 0 dependencies. Most popular terminal color library. |
### UX & Streaming
| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| ora | ^9.3 | Spinners/loading | Elegant terminal spinner for long operations (agent runs, file uploads). ESM-only. Handles stream conflicts (clears spinner before writing, re-renders after). Integrates with cli-spinners for animation variety. |
### Development Tools
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Biome | ^2.3 | Lint + format | Aligns with SDK (@biomejs/biome). Single tool replaces ESLint+Prettier. 472 rules, 50x faster than ESLint. Already configured in the SDK project. |
| Vitest | ^2.1 | Testing | Aligns with SDK (vitest ^2.1.8). Native TypeScript, ESM-first, fast. Use `vi.mock()` to mock SDK client calls in tests. |
| tsx | ^4.21 | Dev runner | Aligns with SDK. Run TypeScript directly without build step during development. Useful for `npm run dev -- agent list`. |
## Installation
# Core dependencies
# Dev dependencies
## Alternatives Considered
### CLI Framework Decision (Critical)
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Commander.js ^14 | oclif | oclif has 30+ dependencies, 85ms startup (vs Commander's 18ms), and is designed for enterprise plugin-based CLIs (Salesforce, Heroku). Our CLI wraps a single SDK with 16 resources -- oclif's scaffolding, plugin system, and conventions are overhead without benefit. oclif also forces a specific project structure (one file per command class) that adds boilerplate for simple CRUD commands. |
| Commander.js ^14 | yargs | yargs has 7 dependencies, 35ms startup, and its API is builder-pattern-heavy (`.option().option().command()` chains). Commander's `.command()` + `.action()` pattern reads more naturally for subcommand-heavy CLIs. yargs excels at complex argument parsing (strict validation, coercion) but Commander handles our needs fine. |
| Commander.js ^14 | citty (unjs) | citty is ESM-only, TypeScript-first, and elegant -- but it's at v0.2.2 with limited adoption (~few hundred weekly downloads). The API is nice (`defineCommand`, lazy subcommands) but the ecosystem is immature. No shell completion, limited documentation, and `meta.hidden`/alias features are still new. Risk of API churn in a 0.x library. |
### Color Library Decision
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| chalk ^5.6 | picocolors | picocolors is smaller (6kB vs 44kB) and faster for single styles, but lacks chaining syntax (`pc.red(pc.bold(text))` vs `chalk.red.bold(text)`). For a CLI with many formatted outputs (status colors, error highlighting, table headers), chalk's ergonomics win. Size difference is irrelevant for a CLI. |
| chalk ^5.6 | ansis | ansis is technically excellent (5.7kB, fast, CJS+ESM dual) but has ~1/100th of chalk's adoption. chalk's API is the de facto standard -- every Node.js developer knows it. |
### YAML Library Decision
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| yaml ^2.8 | js-yaml | js-yaml (v4.1.0) is simpler and slightly faster for basic parse/dump, but `yaml` preserves comments and formatting when round-tripping, which matters for user-edited config files at `~/.agno/config.yaml`. When a user adds a comment like `# production server` above a context entry, we should preserve it. js-yaml drops comments. |
### Build Tool Decision
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| tsup ^8.5 | unbuild (unjs) | unbuild is comparable but tsup is already used by the SDK. Consistency across the monorepo-adjacent projects reduces cognitive overhead. |
| tsup ^8.5 | tsc only | tsc doesn't bundle, meaning the published package includes all source files as separate modules. tsup produces a single bundled output that's faster to install and load. For a CLI, startup time matters. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| inquirer / prompts | Interactive prompts break scripting and piping. This CLI is designed for automation and command chaining (`--output json \| jq`). Interactive input conflicts with that goal. If confirmation is ever needed, use a `--yes` flag pattern. | Commander's built-in option parsing with `--yes`/`--force` flags |
| ink (React for CLIs) | Massive overkill. Ink is for full TUI applications with complex layouts. Our output is tables, JSON, and streaming text -- not interactive UIs. PROJECT.md explicitly excludes GUI/TUI. | chalk + cli-table3 for formatted output |
| cosmiconfig | Config discovery tool that searches package.json, .rc files, etc. We have one config location (`~/.agno/config.yaml`) -- no discovery needed. Direct `yaml` parse of a known path is simpler. | `yaml` package with direct file read |
| dotenv | Environment variable management. Our config is YAML-based with named contexts, not .env files. API keys go in the YAML config, not environment variables (though we should support `AGNO_API_KEY` env var as override). | `yaml` config + `process.env` for overrides |
| log4js / winston / pino | Structured logging frameworks. This is a CLI, not a server. Use `console.error()` for errors, chalk-formatted `console.log()` for output. Adding a logging framework adds startup overhead and configuration complexity for zero benefit. | `console.log()` + chalk for output, `console.error()` for errors |
| commander-completion | Third-party shell completion. Commander 14 has no built-in completion, but this is a v1 deferral. When needed, use tabtab or generate completion scripts manually. | Defer to post-v1 |
## Stack Patterns
- Set `"type": "module"` in package.json
- All chalk, ora, and other modern packages are ESM-only
- Commander 14 supports both CJS and ESM, works fine in ESM context
- tsup builds to ESM format with `format: ['esm']`
- Shebang `#!/usr/bin/env node` in entry point
- All commands accept `--output json` or `--output table` (default: table)
- JSON mode: raw JSON to stdout (pipe-friendly, no color, no spinners)
- Table mode: chalk-colored cli-table3 tables to stdout
- Errors always go to stderr (both modes)
- This enables: `agno agent list --output json | jq '.[0].id' | xargs agno agent get`
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| commander@14 | Node.js >=20 | v14 dropped Node 18 support. Use v12 if Node 18 required. |
| chalk@5.6 | Node.js >=20, ESM only | Will fail with `require()`. Must use `import`. |
| ora@9.3 | Node.js >=20, ESM only | Same ESM constraint as chalk. |
| yaml@2.8 | Node.js >=14, CJS+ESM | No compatibility concerns. |
| cli-table3@0.6.5 | Node.js >=10, CJS+ESM | No compatibility concerns. |
| tsup@8.5 | Node.js >=18 | Dev dependency only, not in production bundle. |
| @worksofadam/agentos-sdk@0.4 | Node.js >=18 (update to >=20) | Dual CJS+ESM export. SDK should update engines to match CLI. |
## Sources
- [npm trends: commander vs oclif vs yargs](https://npmtrends.com/commander-vs-oclif-vs-yargs) -- download comparisons, MEDIUM confidence
- [Commander.js GitHub](https://github.com/tj/commander.js/) -- features, version requirements, HIGH confidence
- [Commander.js npm](https://www.npmjs.com/package/commander) -- v14.0.3, Node >=20 requirement, HIGH confidence
- [citty GitHub](https://github.com/unjs/citty) -- v0.2.2, feature set, MEDIUM confidence
- [yaml npm](https://www.npmjs.com/package/yaml) -- v2.8.3, HIGH confidence
- [cli-table3 npm](https://www.npmjs.com/package/cli-table3) -- v0.6.5, HIGH confidence
- [chalk npm](https://www.npmjs.com/package/chalk) -- v5.6.2, ESM-only, HIGH confidence
- [ora npm](https://www.npmjs.com/package/ora) -- v9.3.0, ESM-only, HIGH confidence
- [tsup docs](https://tsup.egoist.dev/) -- v8.5.1, HIGH confidence
- [Biome GitHub](https://github.com/biomejs/biome) -- v2.3, HIGH confidence
- [Node.js EOL dates](https://endoflife.date/nodejs) -- Node 18 EOL April 2025, HIGH confidence
- [picocolors vs chalk benchmarks](https://dev.to/webdiscus/comparison-of-nodejs-libraries-to-colorize-text-in-terminal-4j3a) -- performance data, MEDIUM confidence
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
