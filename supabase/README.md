# Database

Postgres + pgvector on Supabase. Migrations are plain SQL, applied in filename
order.

## Local

The default Supabase ports are already taken by another project on this machine,
so this one is remapped in `config.toml`:

| Service | Port |
|---|---|
| API | 54421 |
| Postgres | 54422 |
| Studio | 54423 |
| Mailpit | 54424 |

```bash
supabase start
```

```bash
supabase db reset
```

`db reset` drops the local database and replays every migration from scratch —
including the RLS assertion in `20260729000500_rls.sql`, which fails the
migration if any table in `public` is missing RLS or has picked up a policy.

## Migrations

| File | What it does |
|---|---|
| `20260729000100_extensions_and_enums.sql` | `vector` + `pg_trgm` in the `extensions` schema; every enum in the object model |
| `20260729000200_core_tables.sql` | workspace, source, chunk, company, person, project, meeting, task, decision, commitment |
| `20260729000300_relationships.sql` | join tables, each carrying its own provenance |
| `20260729000400_operations.sql` | audit_log, review_item, resolution_hint, daily_brief, ask_query |
| `20260729000500_rls.sql` | enable + force RLS on everything, revoke client-role grants, assert coverage |
| `20260729000600_match_chunks.sql` | hybrid retrieval RPC |

## Access model

Every table has RLS enabled **and forced**, with **no policies**. With RLS on and
no policy, Postgres denies every row — so `anon` and `authenticated` can read
nothing, and the only way in is `service_role`, which carries `BYPASSRLS` and is
reachable only from server code (`src/shared/services/supabase/adminClient.ts`,
guarded by `server-only`).

That is deliberate for Phase 1: the browser never queries data directly, it calls
server code that scopes each query to the caller's workspace. When multi-user
arrives, policies get added here rather than the posture being loosened.

## `match_chunks`

```sql
match_chunks(
  p_workspace_id    uuid,
  p_query_embedding vector(1024) default null,
  p_query_text      text         default null,
  p_match_count     int          default 12,
  p_semantic_weight double precision default 1.0,
  p_full_text_weight double precision default 1.0,
  p_rrf_k           int          default 50,
  p_since           timestamptz  default null,
  p_source_kinds    source_kind[] default null
)
```

Runs pgvector cosine search and Postgres full-text search independently, then
fuses them with Reciprocal Rank Fusion. RRF rather than a weighted score blend
because cosine distance and `ts_rank_cd` are not on the same scale — adding the
raw numbers would let whichever happens to be larger dominate. RRF only uses each
result's rank within its own list.

Either arm can be absent and the function still works: no embedding (Voyage
unreachable) degrades to full-text only; no query text degrades to semantic only.
Returned rows carry `semantic_rank` and `full_text_rank` so the Ask engine can
tell which arm found a chunk, and `source_title` / `occurred_at` so a citation
renders without a second round trip.

Execute is granted to `service_role` only.

## Conventions

- Every table is scoped by `workspace_id`. Phase 1 is single-workspace; the
  column means multi-user is an added policy, not a data migration.
- Model-produced rows carry `fact_type`, `confidence` and `source_ids`. A row
  with empty `source_ids` is a bug — that is the claim with no receipt.
- Objects with a living summary carry provenance for the summary separately from
  the row, because the name is a fact while the summary is an inference.
- `updated_at` is maintained by the `touch_updated_at` trigger, not by callers.
