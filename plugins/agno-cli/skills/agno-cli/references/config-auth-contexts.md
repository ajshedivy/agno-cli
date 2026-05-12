# Config, Contexts, Auth — `agno-cli config` / `agno-cli auth`

## Contexts

A **context** is a saved (name, base_url, security_key, timeout) tuple. One is active at a time. All commands target the active context unless overridden with `--context <name>` / `--url <url>` / `--key <key>` / `--timeout <sec>`.

### config subcommands

```
agno-cli config init [--url <url>] [--key <key>] [--timeout <sec>] [-f]
agno-cli config add <name> --url <url> [--key <key>] [--timeout <sec>]
agno-cli config use <name>
agno-cli config list
agno-cli config show
agno-cli config set <key> <value>          # key = base_url | timeout | security_key
agno-cli config remove <name>
```

**Gotcha**: `config init` defaults to `http://localhost:7777`. Ixora runs on `8000` — pass `--url http://localhost:8000` explicitly.

### Recipes

```bash
# first-time local setup
agno-cli config init --url http://localhost:8000

# add a Railway context
agno-cli config add railway --url https://ixora.up.railway.app --key $IXORA_API_KEY

# switch to Railway
agno-cli config use railway

# rotate a key on the active context
agno-cli config set security_key sk-new-key

# one-off override without touching the context
agno-cli --context railway trace list --limit 5
agno-cli --url https://other.example.com --key xyz agent list

# list + inspect
agno-cli config list
agno-cli config show   # shows: context, base_url, timeout, security_key (or "(not set)")
```

## Auth

### auth me

Shows the current auth identity (user, scopes, key name).

```bash
agno-cli auth me
```

**Gotcha**: fails with `Error: Authentication failed. Check your API key: agno-cli config show` when no key is set on the active context. This is normal for local dev if auth is disabled — it just means the identity endpoint gated behind auth isn't reachable anonymously.

### auth key — API keys

```bash
agno-cli auth key list
agno-cli auth key create --name "ci-pipeline"        # returns the raw key once — copy it
agno-cli auth key get <key_id>
agno-cli auth key revoke <key_id>
agno-cli auth key rotate <key_id>                     # revokes + issues a new one
```

### auth connection — backend connections

Used for target systems (IBM i LPARs, databases) that the server holds credentials for.

```bash
agno-cli auth connection list
agno-cli auth connection get <conn_id>
agno-cli auth connection test <conn_id>               # round-trips a health check
agno-cli auth connection create --name "PROD LPAR" ...
agno-cli auth connection update <conn_id> ...
agno-cli auth connection delete <conn_id>
```

For Ixora, connections represent the IBM i systems that MCP tools talk to (see `auth/connections.py` in the project). If a dash-agent run is failing with connection errors, `agno-cli auth connection test <conn_id>` is the first diagnostic.

## Global flag overrides

Every command accepts these global flags (before the subcommand):

```
agno-cli [-c|--context <name>] [--url <url>] [--key <key>] [--timeout <sec>] [--no-color] [--json [fields]] [-o json|table] <subcommand> ...
```

`--json [fields]` takes an optional comma-separated field list. `--json` alone = full JSON, `--json id,name` = just those fields.
