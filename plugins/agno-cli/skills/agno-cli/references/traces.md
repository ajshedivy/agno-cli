# Traces — `agno-cli trace`

Four subcommands: `list`, `get`, `stats`, `search`.

## trace list

Returns recent traces, newest first, with pagination metadata.

```
agno-cli trace list [options]

  --run-id <id>       filter by run ID (single invocation inside a session)
  --session-id <id>   filter by session ID (conversation)
  --user-id <id>      filter by user (e.g. ajshedivyaj@gmail.com)
  --agent-id <id>     filter by agent member (e.g. toystore-analytics-analyst)
  --status <status>   OK | ERROR (exact match)
  --limit <n>         page size (default 20)
  --page <n>          page number (default 1)
  --db-id <id>        database ID (only if multi-DB)
```

Each row includes `trace_id`, `name`, `status`, `duration`, `total_spans`, `error_count`, `start_time`, `end_time`, `created_at`, and (when available) `input`, `run_id`, `session_id`, `user_id`, `agent_id`, `team_id`.

Response also includes a `meta` block with `page`, `limit`, `total_pages`, `total_count`, `search_time_ms`.

### Recipes

```bash
# last 5 traces on the toystore team
agno-cli trace list --team-id ibmi-dash-toystore --limit 5

# errors only
agno-cli trace list --status ERROR --limit 20

# one user's last page
agno-cli trace list --user-id ajshedivyaj@gmail.com --limit 50

# all spans for a single run
agno-cli trace list --run-id ee7a0342-5699-47fb-83b9-af1a14c8e27d

# just the IDs for scripting
agno-cli trace list --limit 20 --json trace_id,run_id,input
```

## trace get

```
agno-cli trace get <trace_id> [--db-id <id>]
```

Returns the full trace envelope plus a `tree` array representing the span hierarchy. Fields: `trace_id`, `name`, `status`, `duration`, `start_time`, `end_time`, `total_spans`, `error_count`, `tree`.

**Gotcha**: `tree` can be empty (`[]`) when the underlying spans weren't persisted in hierarchical form. The top-level trace still has all the metadata; use `trace list --run-id <run_id>` to enumerate related traces instead.

## trace stats

Aggregated statistics (counts, durations, token totals) over a filter.

```
agno-cli trace stats [options]

  --user-id <id>      filter by user
  --agent-id <id>     filter by agent
  --team-id <id>      filter by team
  --workflow-id <id>  filter by workflow
  --start-time <ts>   ISO time filter
  --end-time <ts>     ISO time filter
  --limit <n>         page size
  --page <n>          page number
  --db-id <id>        database ID
```

No `--group-by` — that's on `trace search`. Use stats for "how many runs did team X do this week + total tokens" rollups.

## trace search

Free-form filter + optional grouping.

```
agno-cli trace search [options]

  --filter <json>       JSON filter (pass-through to API)
  --group-by <field>    run | session
  --limit <n>           page size (default 20)
  --page <n>            page number
  --db-id <id>          database ID
```

`--group-by session` collapses rows to one per session with `total_traces`, `first_trace_at`, `last_trace_at`. Useful for "which sessions has this team been active in?"

```bash
# sessions sorted by recency
agno-cli trace search --group-by session --limit 20

# raw JSON filter (pass-through to API)
agno-cli trace search --filter '{"agent_id": "toystore-analytics-analyst"}'
```

## Debugging a dash-agent run (concrete workflow)

1. Run the team:
   ```bash
   agno-cli team run ibmi-dash-toystore "Monthly revenue for 1997" --stream
   ```
2. Grab the session_id from the streamed output OR the latest trace:
   ```bash
   agno-cli trace list --team-id ibmi-dash-toystore --limit 1 --json session_id,run_id,trace_id,input
   ```
3. See every trace inside that session:
   ```bash
   agno-cli trace list --session-id <session_id> --limit 50
   ```
4. Zoom into one:
   ```bash
   agno-cli trace get <trace_id>
   ```
5. If a team member seems to have skipped a step, filter to just that member:
   ```bash
   agno-cli trace list --session-id <session_id> --agent-id toystore-analytics-engineer
   ```

## Span-tree interpretation

When `tree` is populated, each node has the shape:

```json
{
  "span_id": "...",
  "parent_span_id": "...",
  "name": "Claude.ainvoke_stream" | "MCPTools.call_tool" | "Agent.arun" | ...,
  "status": "OK" | "ERROR",
  "duration": "12.34s",
  "attributes": { ... },
  "children": [ ... ]
}
```

Tool-call names (`MCPTools.call_tool.<tool_name>`) are where tool-usage bugs surface — missing/duplicate tool calls, wrong tool selected, etc. Tally them to diagnose routing.
