# Sessions and Memory — `agno-cli session` / `agno-cli memory`

## sessions

A **session** is a conversation container. Each session has zero or more **runs** (single agent/team/workflow invocations). Sessions belong to a user or are anonymous.

### session list

```
agno-cli session list [options]

  --type <type>         agent | team | workflow
  --component-id <id>   filter by agent/team/workflow ID
  --user-id <id>        filter by user
  --limit <n>           page size (default 20)
  --page <n>            page number
  --sort-by <field>     sort key
  --sort-order asc|desc
  --db-id <id>          database ID
```

Fields returned: `session_id`, `session_name`, `session_type`, `session_state`, `created_at`, `updated_at`, `user_id`, `agent_id` | `team_id` | `workflow_id`, `metrics` (token counts per model).

### session get / runs / create / update / delete

```bash
agno-cli session get <session_id>                    # full state incl. messages
agno-cli session runs <session_id>                   # every run in the session
agno-cli session create --type team --component-id ibmi-team --name "Debug session" --user-id me
agno-cli session update <id> --name "new name" --state '{"foo":"bar"}' --metadata '{"tag":"dev"}'
agno-cli session delete <id>
agno-cli session delete-all                          # bulk (reads filter flags)
```

`session update` accepts `--name`, `--state <json>`, `--metadata <json>`, `--summary <text>`.

### Recipes

```bash
# latest 10 sessions for the toystore team
agno-cli session list --type team --component-id ibmi-dash-toystore --limit 10

# all runs in a session
agno-cli session runs 6d9db701-39e7-4ccc-b989-6f1a72970ad6

# my sessions, sorted newest first
agno-cli session list --user-id ajshedivyaj@gmail.com --sort-by created_at --sort-order desc
```

## memory

User memories — long-lived facts keyed to a user_id (optionally scoped to agent_id or team_id).

### memory list

```
agno-cli memory list [options]

  --user-id <id>        filter by user
  --team-id <id>        filter by team
  --agent-id <id>       filter by agent
  --search <content>    substring search over memory content
  --topics <csv>        topic filter (comma-separated)
  --limit <n>           page size (default 20)
  --page <n>            page number
  --sort-by <field>
  --sort-order asc|desc
  --db-id <id>
```

Each memory row: `memory_id`, `memory` (content string), `topics` (array), `agent_id`, `team_id`, `user_id`, `created_at`, `updated_at`.

### memory CRUD + extras

```bash
agno-cli memory create --user-id me --memory "User prefers concise answers" --topics "preferences,style"
agno-cli memory get <memory_id>
agno-cli memory update <memory_id> --memory "..." --topics "..."
agno-cli memory delete <memory_id>
agno-cli memory delete-all --user-id me
agno-cli memory topics --user-id me                  # list distinct topics for a user
agno-cli memory stats --user-id me                   # counts/summary
agno-cli memory optimize --user-id me                # agentic dedup/merge
```

**Gotcha**: `memory create`, not `memory add`. Same pattern across the CLI (`update`, `delete`, not `edit`, `remove`).

### Recipes

```bash
# what does the system "remember" about a specific agent + user combo?
agno-cli memory list --user-id ajshedivyaj@gmail.com --agent-id ibmi-system-health --limit 50

# search memories for a keyword
agno-cli memory list --user-id ajshedivyaj@gmail.com --search "QSECURITY"

# topic breakdown
agno-cli memory topics --user-id ajshedivyaj@gmail.com
```

## Session vs Memory — when to reach for which

| Need | Use |
|---|---|
| "What was said in this conversation?" | `session get <id>` |
| "What runs happened in this session?" | `session runs <id>` |
| "What long-lived facts does the agent know about this user?" | `memory list --user-id <id>` |
| "What topics has this user touched?" | `memory topics --user-id <id>` |
