# agent / team / workflow — `agno-cli {agent,team,workflow}`

These three subcommands share the same verb set: `list`, `get`, `run`, `continue`, `cancel`.

## list

```
agno-cli {agent|team|workflow} list [--limit <n>] [--page <n>]
```

Returns id, name, description, db_id. Teams also have `mode` (coordinate | route | broadcast). Workflows have `is_factory` and `is_component` flags.

## get

```
agno-cli {agent|team|workflow} get <id>
```

Full component details including instructions, tools, model config (if exposed).

## run

```
agno-cli agent    run <agent_id>    <message> [--stream] [--session-id <id>] [--user-id <id>]
agno-cli team     run <team_id>     <message> [--stream] [--session-id <id>] [--user-id <id>]
agno-cli workflow run <workflow_id> <message> [--stream] [--session-id <id>] [--user-id <id>]
```

- **`--stream` / `-s`** — consume SSE events live. Without it, you get the final response as a single JSON blob.
- **`--session-id`** — thread conversation context. Reuse an existing session ID to continue a chat; omit to start a new session.
- **`--user-id`** — tag the run for per-user memory/metrics.
- **`<message>`** is a single positional string. Quote it.

### Recipes

```bash
# one-shot, get full response
agno-cli agent run ibmi-system-health "Full system health check"

# stream so you see progress
agno-cli team run ibmi-team "Audit security on the prod LPAR" --stream

# continue a session
agno-cli agent run ibmi-text2sql "What are the top 5 by revenue?" \
  --session-id 6d9db701-39e7-4ccc-b989-6f1a72970ad6

# run workflow (e.g. security-assessment-v2)
agno-cli workflow run security-assessment-v2 "Audit production"
```

## continue

Continue a run that requested human input (tool approval, clarifying question).

```
agno-cli agent    continue <agent_id>    <run_id> [tool_results] [options]
agno-cli team     continue <team_id>     <run_id> <message>        [options]
agno-cli workflow continue <workflow_id> <run_id> <message>        [options]
```

Note the shape differs: agent `continue` takes optional `tool_results`; team and workflow take a required `message`. This pairs with `approval resolve` for HITL flows.

## cancel

```
agno-cli {agent|team|workflow} cancel <component_id> <run_id>
```

Terminates an in-progress run. Useful when a loop is stuck or a streaming call got abandoned.

## Streaming output

With `--stream`, the CLI prints SSE events to stdout. Shape (abbreviated):

```
event: run.started
data: {"run_id": "...", "component_id": "...", ...}

event: run.content
data: {"content": "Hello, ..."}

event: run.tool_call
data: {"name": "execute_sql", "arguments": {...}}

event: run.tool_result
data: {"name": "execute_sql", "result": "..."}

event: run.completed
data: {"run_id": "...", "content": "<final>", ...}
```

For scripted consumers, parse each `event:` line and the subsequent `data:` JSON.

## Structured output

The CLI doesn't expose a `--response-model` flag. For structured output, use the Python SDK or hit the HTTP API directly. See `agno-agentos-api:agentos-api-agents`.
