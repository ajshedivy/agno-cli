# agno-cli

A Node.js/TypeScript CLI for managing and interacting with [Agno AgentOS](https://github.com/agno-agi/agno) instances. Built on top of the `@worksofadam/agentos-sdk`, it provides full coverage of the AgentOS API -- agents, teams, workflows, sessions, traces, knowledge, memories, evals, metrics, schedules, approvals, and more.

Designed for both human operators and AI agent automation, with JSON output and piping support that lets you chain commands together in shell scripts and pipelines.

## Quick Start

### Install

```bash
npm install -g agno-cli
```

Or run directly without installing:

```bash
npx agno-cli
```

Requires Node.js >= 20.

### Configure

Point the CLI at your AgentOS instance:

```bash
# Initialize with defaults (localhost:7777)
agno-cli config init

# Or specify your server URL
agno-cli config init --url http://localhost:8000

# With a security key
agno-cli config init --url https://my-agentos.example.com --key sk-your-key-here
```

### Verify connection

```bash
agno-cli status
```

### Run your first agent

```bash
# List available agents
agno-cli agent list

# Run one
agno-cli agent run my-agent "Hello, what can you do?"

# Stream the response in real-time
agno-cli agent run my-agent "Summarize this data" --stream
```

## Configuration

Config lives at `~/.agno/config.yaml`. You can manage multiple server contexts and switch between them.

```bash
# Add a production context
agno-cli config add production --url https://prod.example.com --key sk-prod-key

# Switch to it
agno-cli config use production

# See what's active
agno-cli config show

# List all contexts
agno-cli config list
```

### Environment Variable Overrides

These take precedence over the config file:

| Variable | Description |
|---|---|
| `AGNO_CONTEXT` | Override active context name |
| `AGNO_BASE_URL` | Override base URL |
| `AGNO_SECURITY_KEY` | Override security key |
| `AGNO_TIMEOUT` | Override timeout (seconds) |

## Global Options

These work with any command:

```
-V, --version              Show version
-c, --context <name>       Override active context
--url <url>                Override base URL
--key <key>                Override security key
--timeout <seconds>        Override timeout
--no-color                 Disable color output
--json [fields]            Output JSON (optional field selection: --json id,name)
-o, --output <format>      Output format: json | table
```

Output format auto-detects: table when interactive, JSON when piped.

## Command Reference

### status

Show AgentOS server info and resource counts.

```bash
agno-cli status
```

### agent

Manage and run agents.

```bash
agno-cli agent list [--limit N] [--page N]
agno-cli agent get <agent_id>
agno-cli agent run <agent_id> <message> [-s|--stream] [--session-id ID] [--user-id ID]
agno-cli agent continue <agent_id> <run_id> [tool_results] [-s|--stream] [--confirm] [--reject [note]]
agno-cli agent cancel <agent_id> <run_id>
```

The `continue` command handles paused runs (e.g., tool approval). Paused state is cached locally, so `--confirm` and `--reject` work without re-supplying tool results.

### team

Manage and run teams.

```bash
agno-cli team list [--limit N] [--page N]
agno-cli team get <team_id>
agno-cli team run <team_id> <message> [-s|--stream] [--session-id ID] [--user-id ID]
agno-cli team continue <team_id> <run_id> <message> [-s|--stream]
agno-cli team cancel <team_id> <run_id>
```

### workflow

Manage and run workflows.

```bash
agno-cli workflow list [--limit N] [--page N]
agno-cli workflow get <workflow_id>
agno-cli workflow run <workflow_id> <message> [-s|--stream] [--session-id ID] [--user-id ID]
agno-cli workflow continue <workflow_id> <run_id> <message> [-s|--stream]
agno-cli workflow cancel <workflow_id> <run_id>
```

### session

Manage conversation sessions.

```bash
agno-cli session list [--type agent|team|workflow] [--component-id ID] [--user-id ID]
agno-cli session get <session_id>
agno-cli session create --type <type> --component-id <id> [--name NAME] [--user-id ID]
agno-cli session update <session_id> [--name NAME] [--state JSON] [--metadata JSON] [--summary TEXT]
agno-cli session delete <session_id>
agno-cli session delete-all --ids <id1,id2> --types <type1,type2>
agno-cli session runs <session_id>
```

### memory

Manage agent memories.

```bash
agno-cli memory list [--user-id ID] [--agent-id ID] [--search CONTENT] [--topics t1,t2]
agno-cli memory get <memory_id>
agno-cli memory create --memory <content> [--topics t1,t2] [--user-id ID]
agno-cli memory update <memory_id> [--memory CONTENT] [--topics t1,t2]
agno-cli memory delete <memory_id>
agno-cli memory delete-all --ids <id1,id2>
agno-cli memory topics [--user-id ID]
agno-cli memory stats [--user-id ID]
agno-cli memory optimize --user-id <id> [--model MODEL] [--apply]
```

### knowledge

Manage the knowledge base.

```bash
agno-cli knowledge upload [file_path] [--url URL] [--name NAME] [--description DESC]
agno-cli knowledge list [--limit N] [--page N]
agno-cli knowledge get <content_id>
agno-cli knowledge search <query> [--search-type vector|keyword|hybrid] [--max-results N]
agno-cli knowledge status <content_id>
agno-cli knowledge delete <content_id>
agno-cli knowledge delete-all
agno-cli knowledge config
```

### trace

View execution traces.

```bash
agno-cli trace list [--run-id ID] [--session-id ID] [--agent-id ID] [--status STATUS]
agno-cli trace get <trace_id>
agno-cli trace stats [--agent-id ID] [--start-time TIME] [--end-time TIME]
agno-cli trace search [--filter JSON] [--group-by run|session]
```

### eval

Manage evaluation runs.

```bash
agno-cli eval list [--agent-id ID] [--type TYPE]
agno-cli eval get <eval_run_id>
agno-cli eval delete --ids <id1,id2>
```

### approval

Manage tool call approvals.

```bash
agno-cli approval list [--status pending|approved|rejected] [--agent-id ID]
agno-cli approval get <id>
agno-cli approval resolve <id> --status approved|rejected [--resolved-by USER]
```

### metrics

View and refresh metrics.

```bash
agno-cli metrics get [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]
agno-cli metrics refresh
```

### models

List available models.

```bash
agno-cli models list [--limit N] [--page N]
```

### auth

Authentication, API keys, and connections.

```bash
# Current user
agno-cli auth me

# API keys
agno-cli auth key list
agno-cli auth key create --name <name> [--scopes s1,s2] [--expires-at ISO_DATE]
agno-cli auth key get <key_id>
agno-cli auth key revoke <key_id>
agno-cli auth key rotate <key_id>

# Connections (e.g., database connections)
agno-cli auth connection list
agno-cli auth connection create --name <name> --host <host> --port <port> --user <user> --password <pw>
agno-cli auth connection get <conn_id>
agno-cli auth connection update <conn_id> [--name NAME] [--host HOST] [--port PORT]
agno-cli auth connection delete <conn_id>
agno-cli auth connection test <conn_id>
```

### component

Manage agent/team/workflow components.

```bash
agno-cli component list [--type agent|team|workflow]
agno-cli component get <component_id>
agno-cli component create --name <name> --type <type> [--description DESC] [--config JSON]
agno-cli component update <component_id> [--name NAME] [--stage draft|published]
agno-cli component delete <component_id>

# Component configurations
agno-cli component config list <component_id>
agno-cli component config create <component_id> --config <json>
agno-cli component config update <component_id> <version> --config <json>
agno-cli component config delete <component_id> <version>
```

### schedule

Manage scheduled tasks.

```bash
agno-cli schedule list [--enabled]
agno-cli schedule get <id>
agno-cli schedule create --name <name> --cron <expr> --endpoint <url> --method <method>
agno-cli schedule update <id> [--name NAME] [--cron EXPR] [--endpoint URL]
agno-cli schedule delete <id>
agno-cli schedule pause <id>
agno-cli schedule resume <id>
agno-cli schedule runs <id>
```

### database

Database management.

```bash
agno-cli database migrate <db_id> [--target-version VERSION]
```

### registry

Browse the registry.

```bash
agno-cli registry list [--type TYPE] [--name NAME]
```

## Examples

### Basic Usage

```bash
# Check server status
agno-cli status

# List agents as a table (default)
agno-cli agent list

# Get detailed info on a specific agent
agno-cli agent get ibmi-text2sql--default

# Run an agent and see the response
agno-cli agent run ibmi-text2sql--default "What tables are in QIWS?"

# Stream the response as it's generated
agno-cli agent run ibmi-text2sql--default "List all customers" --stream
```

### Working with Sessions

```bash
# Create a session for multi-turn conversation
agno-cli session create --type agent --component-id ibmi-text2sql--default --name "Q2 analysis"

# Use the session ID to maintain context across runs
agno-cli agent run ibmi-text2sql--default "What's in QCUSTCDT?" --session-id <session_id>
agno-cli agent run ibmi-text2sql--default "Now filter where BALDUE > 100" --session-id <session_id>
```

### Handling Paused Runs (Tool Approval)

When an agent pauses for tool approval, the CLI caches the paused state locally:

```bash
# Agent pauses waiting for approval
agno-cli agent run ibmi-text2sql--default "execute: SELECT * FROM QIWS.QCUSTCDT"
# Output: Run paused (run_id: abc123). Use: agno-cli agent continue ... --confirm

# Approve and continue
agno-cli agent continue ibmi-text2sql--default abc123 --confirm

# Or reject with a reason
agno-cli agent continue ibmi-text2sql--default abc123 --reject "Too broad, add a WHERE clause"
```

### JSON Output and Field Selection

```bash
# Full JSON output
agno-cli agent list --output json

# Select specific fields
agno-cli agent list --json id,name

# JSON is the default when piped
agno-cli agent list | head -5
```

### Chaining Commands with Pipes

The CLI outputs clean JSON when piped, making it composable with `jq`, `xargs`, and other tools.

**Run an agent and extract the content from the response:**

```bash
agno-cli agent run ibmi-text2sql--default "What tables exist in QIWS?" --output json | jq -r '.content'
```

**List agents and get details for each one:**

```bash
agno-cli agent list --output json | jq -r '.[] | .agent_id' | while read id; do
  echo "=== $id ==="
  agno-cli agent get "$id" --output json | jq '.description'
done
```

**Run a query, handle the tool approval, and get the final result:**

```bash
agno-cli agent run ibmi-text2sql--default \
    "execute: SELECT LSTNAM, BALDUE FROM QIWS.QCUSTCDT WHERE BALDUE > 100" \
    --output json \
    | jq -r 'select(.status == "PAUSED") | .run_id' \
    | xargs -I{} agno-cli agent continue ibmi-text2sql--default {} --confirm --output json \
    | jq -r '.content'
```

**Find and resolve pending approvals:**

```bash
agno-cli approval list --status pending --output json \
    | jq -r '.[].id' \
    | xargs -I{} agno-cli approval resolve {} --status approved
```

**Search knowledge base and pipe results into an agent:**

```bash
CONTEXT=$(agno-cli knowledge search "customer data" --output json | jq -r '.[0].content')
agno-cli agent run my-analyst "Analyze this: $CONTEXT"
```

**Monitor traces for a specific agent:**

```bash
agno-cli trace list --agent-id ibmi-text2sql--default --output json \
    | jq '.[] | {trace_id, status, duration}'
```

### Scripting Patterns

**Health check script:**

```bash
#!/bin/bash
STATUS=$(agno-cli status --output json 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "AgentOS is unreachable" >&2
  exit 1
fi
echo "$STATUS" | jq -r '"Agents: \(.agent_count), Teams: \(.team_count)"'
```

**Batch run agents from a file:**

```bash
while IFS= read -r query; do
  echo "--- Query: $query ---"
  agno-cli agent run ibmi-text2sql--default "$query" --output json | jq -r '.content'
  echo
done < queries.txt
```

**Switch context per-command without changing your config:**

```bash
# One-off command against production
agno-cli --context production agent list

# Or override the URL directly
agno-cli --url https://prod.example.com agent list
```

### Tips

- **Streaming vs JSON:** `--stream` writes tokens as they arrive (great for interactive use), while `--output json` waits for the full response (great for scripting). Don't combine them.
- **Auto-detect:** Output format auto-detects -- table when your terminal is interactive, JSON when piped. Use `--output` to override.
- **Errors to stderr:** Errors always go to stderr in both modes, so they won't corrupt your piped JSON.
- **`--db-id`:** Most commands accept `--db-id` for multi-database AgentOS setups. Omit it for single-database instances.
- **Pagination:** Use `--limit` and `--page` on list commands. JSON output includes pagination metadata.

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (no build needed)
npm run dev -- agent list

# Build
npm run build

# Run tests
npm run test

# Lint
npm run lint

# Type check
npm run typecheck
```

## License

ISC
