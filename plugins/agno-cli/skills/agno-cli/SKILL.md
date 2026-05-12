---
name: agno-cli
description: Operate a running AgentOS server from the command line via agno-cli. Use when the user asks to check AgentOS status, list agents/teams/workflows, run an agent or team from the CLI, analyze or inspect a trace, debug a dash-agent / Analyst / Engineer run, look at trace IDs or span trees, tail or list sessions, view session runs, inspect memories, search or upload knowledge base content, view eval runs, manage approvals, configure the agno-cli endpoint, switch agno contexts (local vs Railway), test connections, or manage schedules/components/registry on an AgentOS instance.
---

# agno-cli

CLI for operating a running **AgentOS** server (the Ixora AgentOS at `http://localhost:8000` by default, or any other Agno deployment).

## When to use this skill

Use `agno-cli` when the user wants to inspect or drive a **running** AgentOS instance: check a trace after an agent run, list sessions during development, run an agent/team/workflow, manage knowledge content, view evals, or configure endpoints.

**Do NOT use this skill** for building or editing agents themselves — for that, use the Agno SDK skills (`agno-framework:agno-agent`, `agno-framework:agno-team`, etc.) which work with the Python source. This skill is CLI-first and only runs against live HTTP endpoints.

For complex scripting that outgrows the CLI, the Python SDK is the escape hatch: `from agno.client import AgentOSClient`. See `agno-framework:agno-test` or `agno-agentos-api:*` skills.

## First-time setup

The CLI stores contexts (named endpoint + key + timeout) in a local config. Initialize once:

```bash
agno-cli config init --url http://localhost:8000
agno-cli config show         # verify active context
agno-cli config list         # list all contexts
```

Add contexts for other deployments (e.g. Railway, staging), then switch:

```bash
agno-cli config add railway --url https://ixora.up.railway.app --key $IXORA_API_KEY
agno-cli config use railway
agno-cli config set base_url http://localhost:8000   # patch active context
```

Override the active context inline with global flags on any command: `--context <name>`, `--url <url>`, `--key <key>`, `--timeout <sec>`.

## Output formats

Every command supports:

- `-o table` — human-readable table (truncates wide fields)
- `--json` — full JSON blob
- `--json id,name` — JSON with just those fields (field-select)
- default — pretty JSON

Pipe to `jq` when chaining (`agno-cli trace list --json trace_id | jq -r '.[].trace_id'`).

## Common workflows

### 1. Inspect a trace after an agent run

```bash
agno-cli trace list --limit 5                         # recent traces w/ trace_id, duration, status, input
agno-cli trace list --team-id ibmi-dash-toystore      # filter by team
agno-cli trace list --agent-id toystore-analytics-analyst --limit 10
agno-cli trace get <trace_id>                          # full trace + span tree
agno-cli trace stats --team-id ibmi-dash-toystore     # aggregated counts/duration/tokens
agno-cli trace search --group-by session --limit 10   # aggregate by session
```

Trace list output includes `trace_id`, `run_id`, `session_id`, `user_id`, `agent_id`, `team_id`, `input`, `duration`, `total_spans`, `error_count`. The `run_id` links back to the session's run history. See [references/traces.md](references/traces.md).

### 2. Tail sessions during development

```bash
agno-cli session list --limit 10                       # recent sessions across all types
agno-cli session list --type team --component-id ibmi-dash-toystore
agno-cli session list --user-id ajshedivyaj@gmail.com
agno-cli session get <session_id>                      # session state + messages
agno-cli session runs <session_id>                     # all runs within a session
```

### 3. Run an agent, team, or workflow from the CLI

```bash
agno-cli agent list --json id,name                     # see what's available
agno-cli agent run ibmi-system-health "Full system health check"
agno-cli agent run ibmi-text2sql "Top 10 customers by revenue" --stream --session-id my-dev-session

agno-cli team run ibmi-dash-toystore "Monthly revenue for 1997"
agno-cli workflow run security-assessment-v2 "Audit the production LPAR"
```

Add `--stream` to get SSE events instead of the final response. `--session-id` threads conversation context; reuse an existing session ID to continue a chat.

### 4. Manage knowledge base content

When multiple knowledge bases exist, **you must pass `--knowledge-id` or `--db-id`** (see pitfalls). List KB IDs from `agno-cli status` under `knowledge.knowledge_instances`.

```bash
agno-cli knowledge list --knowledge-id <kb_id> --limit 20
agno-cli knowledge search --knowledge-id <kb_id> --max-results 5 "revenue pattern"
agno-cli knowledge upload ./notes.md --knowledge-id <kb_id> --name "Q2 Notes"
agno-cli knowledge upload --url https://example.com/doc.pdf --knowledge-id <kb_id>
agno-cli knowledge status <content_id>                 # processing status
agno-cli knowledge delete <content_id>
```

Search types: `vector` (default), `keyword`, `hybrid`.

### 5. Check server health

```bash
agno-cli status                                         # full OS inventory: agents, teams, workflows, KBs, DBs
agno-cli status --json agents,teams                     # just the agents/teams blocks
```

## Subcommand map

| Subcommand | Purpose | Reference |
|---|---|---|
| `config` | Contexts (endpoint + key) — `init`, `add`, `use`, `list`, `show`, `set`, `remove` | [references/config-auth-contexts.md](references/config-auth-contexts.md) |
| `status` | Full OS inventory in one JSON dump | inline above |
| `agent` | `list`, `get`, `run`, `continue`, `cancel` | [references/agents-teams-workflows.md](references/agents-teams-workflows.md) |
| `team` | `list`, `get`, `run`, `continue`, `cancel` | [references/agents-teams-workflows.md](references/agents-teams-workflows.md) |
| `workflow` | `list`, `get`, `run`, `continue`, `cancel` | [references/agents-teams-workflows.md](references/agents-teams-workflows.md) |
| `trace` | `list`, `get`, `stats`, `search` | [references/traces.md](references/traces.md) |
| `session` | `list`, `get`, `create`, `update`, `delete`, `delete-all`, `runs` | [references/sessions-memory.md](references/sessions-memory.md) |
| `memory` | `list`, `get`, `create`, `update`, `delete`, `delete-all`, `topics`, `stats`, `optimize` | [references/sessions-memory.md](references/sessions-memory.md) |
| `knowledge` | `upload`, `list`, `get`, `search`, `status`, `delete`, `delete-all`, `config` | [references/knowledge.md](references/knowledge.md) |
| `eval` | `list`, `get`, `delete` — **CLI does not run evals; it lists existing runs** | one-line use |
| `approval` | `list`, `get`, `resolve` — human-in-the-loop approvals | one-line use |
| `auth` | `me`, `key` (create/list/revoke/rotate), `connection` (create/list/test/delete) | [references/config-auth-contexts.md](references/config-auth-contexts.md) |
| `component` | `list`, `get`, `create`, `update`, `delete`, `config` — dynamic components | one-line use |
| `schedule` | Cron schedules for endpoint callbacks — `list`, `create`, `pause`, `resume`, `runs` | one-line use |
| `database` | `migrate <db_id>` — run migrations | one-line use |
| `registry` | `list` — agent/team/workflow class paths | one-line use |
| `models` | `list` — enumerate available models on the server | one-line use |
| `metrics` | `get`, `refresh` — aggregated token/cost metrics | one-line use |

## One-line recipes

```bash
# Recent traces for a specific team, IDs only
agno-cli trace list --team-id ibmi-dash-toystore --limit 10 --json trace_id,duration,input

# Find all sessions from one agent in the last N pages
agno-cli session list --type agent --component-id ibmi-text2sql --limit 50

# Get token usage for a team over all runs
agno-cli trace stats --team-id ibmi-dash-toystore

# Tail new traces after a run (rerun every few seconds)
agno-cli trace list --limit 5 --json trace_id,name,status,duration,input

# Aggregate traces by session
agno-cli trace search --group-by session --limit 20

# Create + rotate an API key
agno-cli auth key create --name "ci-pipeline"
agno-cli auth key rotate <key_id>

# Test an IBM i connection (auth → connection subsystem)
agno-cli auth connection list
agno-cli auth connection test <conn_id>
```

## Common pitfalls

- **Knowledge commands fail without `--knowledge-id` when multiple KBs exist.** Error: `db_id or knowledge_id query parameter is required`. Get IDs from `agno-cli status` (look under `knowledge.knowledge_instances`).
- **`agno-cli auth me` / `auth connection list` fail with "Authentication failed" if no `security_key` is configured** — not a bug, just means the context has no API key set. Run `agno-cli config set security_key <key>` or `agno-cli config add <name> --key <key>`.
- **`trace stats` does NOT take `--group-by`** — that flag is only on `trace search`. `stats` returns aggregated totals; `search --group-by session|run` returns grouped rows.
- **`trace get <id>` returns `"tree": []` when no span hierarchy was recorded** — usually still shows top-level trace metadata and counts. Don't assume the trace is broken.
- **No top-level `--limit` global flag** — `--limit` is per subcommand (`trace list --limit 5`). If output is huge, always specify.
- **`agno-cli eval` lists/gets/deletes only** — it does NOT run evals from the CLI. Run evals via the Agno SDK or the `agno-agentos-api:agentos-api-evals` skill.
- **`agno-cli memory` commands are `create`/`update`/`delete`, not `add`/`edit`/`remove`.** Use `memory create`, not `memory add`.
- **`session list --type` accepts `agent | team | workflow`** — match exactly.
- **Config keys on `config set` are `base_url`, `timeout`, `security_key`** (not `url` or `key`).
- **Default port on `config init` is 7777, but Ixora runs on 8000.** Pass `--url http://localhost:8000` explicitly.

## Ixora-specific context

The Ixora AgentOS currently hosts three teams (`ibmi-team`, `multi-system-security-team`, `ibmi-dash-toystore`) and 11+ agents. When debugging a dash-agent / Analyst / Engineer run, the fastest path is:

```bash
agno-cli trace list --team-id ibmi-dash-toystore --limit 5
agno-cli trace get <trace_id>
```

For routing diagnostics (who did the team leader hand off to?), filter by `--agent-id toystore-analytics-analyst` or `--agent-id toystore-analytics-engineer` to see just that member's spans.
