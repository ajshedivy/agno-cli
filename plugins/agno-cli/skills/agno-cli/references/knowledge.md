# Knowledge — `agno-cli knowledge`

Nine subcommands: `upload`, `list`, `get`, `search`, `status`, `delete`, `delete-all`, `config`.

## The multi-KB gotcha

If the server has **more than one knowledge base**, every command that touches content requires `--knowledge-id <id>` (or `--db-id <id>`). Without it, the server returns:

```
Error: Invalid request: db_id or knowledge_id query parameter is required
when using multiple knowledge bases.
Available IDs: ['<uuid1>', '<uuid2>', ...]
```

Discover the IDs via:

```bash
agno-cli status --json knowledge
# look under .knowledge.knowledge_instances[*].id + .name
```

Example (Ixora):

| Name | ID |
|---|---|
| IBM i Security Knowledge | `ec8d86be-f5d3-666b-01bb-ac1c31a1897f` |
| Toystore Analytics Knowledge | `0775d089-7499-907f-419c-4d8383be77e4` |
| IBM i Learned Knowledge | `90d16932-cf61-2b9b-cc41-447661071e4c` |

Save `--knowledge-id` in a shell var to avoid retyping.

## list

```
agno-cli knowledge list [options]

  --knowledge-id <id>   (required when >1 KB)
  --db-id <id>
  --limit <n>           default 20
  --page <n>
  --sort-by <field>
  --sort-order asc|desc
```

Fields: `id`, `name`, `description`, `type` (Text|PDF|URL|...), `size`, `linked_to`, `metadata` (category, filename, extension, source_path), `access_count`, `status` (pending|processing|completed|failed), `status_message`, `created_at`, `updated_at`.

```bash
KB=0775d089-7499-907f-419c-4d8383be77e4
agno-cli knowledge list --knowledge-id $KB --limit 20 --json id,name,type,status
```

## search

```
agno-cli knowledge search [options] <query>

  --knowledge-id <id>       (required when >1 KB)
  --search-type <type>      vector | keyword | hybrid (default: vector)
  --max-results <n>
  --limit <n>               default 20
  --page <n>
  --db-id <id>
```

Returns chunks with `content`, `name` (source filename), `meta_data` (chunk index, category, similarity_score), `usage` (token counts). Similarity scores live in `meta_data.similarity_score`.

```bash
# vector search
agno-cli knowledge search --knowledge-id $KB --max-results 5 "monthly revenue pattern"

# hybrid (vector + BM25)
agno-cli knowledge search --knowledge-id $KB --search-type hybrid --max-results 10 "revenue"

# keyword only (exact token matches)
agno-cli knowledge search --knowledge-id $KB --search-type keyword "TOYSTORE3"
```

## upload

Two modes: local file path OR remote URL.

```
agno-cli knowledge upload [file_path] [options]
                           OR
agno-cli knowledge upload --url <url> [options]

  --name <name>          content display name
  --description <desc>
  --knowledge-id <id>
  --db-id <id>
```

```bash
agno-cli knowledge upload ./notes/q2-analysis.md --knowledge-id $KB --name "Q2 Analysis"
agno-cli knowledge upload --url https://example.com/paper.pdf --knowledge-id $KB --description "External paper"
```

After upload, poll status — ingestion (chunking + embedding) is async:

```bash
agno-cli knowledge status <content_id>
```

## get / delete / delete-all

```bash
agno-cli knowledge get <content_id> --knowledge-id $KB
agno-cli knowledge delete <content_id> --knowledge-id $KB
agno-cli knowledge delete-all --knowledge-id $KB        # dangerous — wipes the whole KB
```

## config

```bash
agno-cli knowledge config --knowledge-id $KB
```

Returns KB-level configuration (embedder model, chunk strategy, vector DB settings, etc.).

## Recipes

```bash
# see what was just indexed
agno-cli knowledge list --knowledge-id $KB --sort-by created_at --sort-order desc --limit 10

# find all SQL files in a KB
agno-cli knowledge list --knowledge-id $KB --limit 100 --json id,name | jq '.[] | select(.name | endswith(".sql"))'

# dump metadata for every item (useful for source_path audit)
agno-cli knowledge list --knowledge-id $KB --limit 200 --json name,metadata
```
