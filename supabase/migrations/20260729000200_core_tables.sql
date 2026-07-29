-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — core object model (brief §6)
--
-- Every object is a first-class table, not a note. Every row that the model
-- produced carries provenance: what kind of claim it is, how confident the
-- system is, and which sources it came from. A row with an empty `source_ids`
-- is a bug, not a shortcut.
-- ─────────────────────────────────────────────────────────────────────────────

-- Keeps `updated_at` honest without every write path having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Workspace ────────────────────────────────────────────────────────────────
-- Phase 1 is single-workspace, but every table is scoped by `workspace_id` so
-- multi-user drops in later without a migration of the whole corpus.

create table public.workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  -- The founder's own name and company, used to resolve "I", "me", "us" during
  -- extraction. Without this the model cannot tell whose commitment it is.
  principal_name text not null,
  principal_company text,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspace_owner_idx on public.workspace (owner_user_id);

create trigger workspace_touch
  before update on public.workspace
  for each row execute function public.touch_updated_at();

-- ── Source ───────────────────────────────────────────────────────────────────
-- The original artefact. Stored first, acknowledged immediately, processed
-- after — capture must never block on the pipeline.

create table public.source (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  kind public.source_kind not null,
  title text not null,
  -- Message-Id, file name, CRM export row — whatever identifies it upstream.
  original_ref text,
  -- Supabase Storage path of the original bytes.
  storage_path text,
  -- Extracted plain text. Kept alongside the original so re-chunking never
  -- needs to re-run OCR or PDF parsing.
  body text,
  author text,
  participants text[] not null default '{}',
  -- When the thing happened, not when we ingested it. Ordering the activity
  -- feed by ingestion time would scramble history on a bulk import.
  occurred_at timestamptz,
  ingested_at timestamptz,
  status public.source_status not null default 'captured',
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index source_workspace_idx on public.source (workspace_id, occurred_at desc nulls last);
create index source_status_idx on public.source (workspace_id, status);
-- Re-ingesting the same upstream artefact must update, not duplicate.
-- Deliberately NOT a partial index: Postgres cannot infer a partial unique index
-- for `on conflict`, which is exactly how ingestion upserts. Nulls are distinct
-- by default, so rows without an `original_ref` are still unconstrained.
create unique index source_original_ref_idx
  on public.source (workspace_id, original_ref);

create trigger source_touch
  before update on public.source
  for each row execute function public.touch_updated_at();

-- ── Chunk ────────────────────────────────────────────────────────────────────
-- The retrieval unit. `content` is the brief's `chunk.text`; renamed only to
-- keep `to_tsvector(...)` expressions unambiguous to read.

create table public.chunk (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  source_id uuid not null references public.source (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  -- Token span within the source, so a citation can highlight the exact passage.
  token_start int,
  token_end int,
  -- voyage-3, 1024 dimensions. Nullable: a chunk exists before it is embedded,
  -- and a failed embedding leaves the row retryable rather than lost.
  embedding extensions.vector(1024),
  embedded_at timestamptz,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

create unique index chunk_source_index_idx on public.chunk (source_id, chunk_index);
create index chunk_workspace_idx on public.chunk (workspace_id);
create index chunk_fts_idx on public.chunk using gin (fts);
-- HNSW over cosine distance: the vector half of `match_chunks`.
create index chunk_embedding_idx
  on public.chunk
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
-- Lets the ingestion worker find what still needs embedding.
create index chunk_unembedded_idx
  on public.chunk (workspace_id)
  where embedding is null;

-- ── Company ──────────────────────────────────────────────────────────────────

create table public.company (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  name text not null,
  -- Every spelling seen in a source. Entity resolution matches against this,
  -- so "Omnilux", "Omnilux Ltd" and "omnilux.io" converge on one row.
  aliases text[] not null default '{}',
  domains text[] not null default '{}',
  type public.company_type not null default 'unknown',
  industry text,
  risk_level public.risk_level not null default 'none',
  opportunity_level public.opportunity_level not null default 'none',

  -- Living summary, regenerated after every source that touches this company.
  summary text,
  summary_fact_type public.fact_type not null default 'inference',
  summary_confidence numeric(4, 3) not null default 0
    check (summary_confidence >= 0 and summary_confidence <= 1),
  summary_source_ids uuid[] not null default '{}',
  summary_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_name_idx on public.company (workspace_id, lower(name));
create index company_aliases_idx on public.company using gin (aliases);
create index company_name_trgm_idx on public.company using gin (name extensions.gin_trgm_ops);

create trigger company_touch
  before update on public.company
  for each row execute function public.touch_updated_at();

-- ── Person ───────────────────────────────────────────────────────────────────

create table public.person (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  emails text[] not null default '{}',
  company_id uuid references public.company (id) on delete set null,
  role text,
  relationship_type public.relationship_type not null default 'unknown',
  relationship_strength public.relationship_strength not null default 'unknown',
  last_interaction timestamptz,
  timezone text,
  next_action text,

  -- The reference calls this the living summary; the brief calls it
  -- current_context. Same field: what is true about this person right now.
  current_context text,
  current_context_fact_type public.fact_type not null default 'inference',
  current_context_confidence numeric(4, 3) not null default 0
    check (current_context_confidence >= 0 and current_context_confidence <= 1),
  current_context_source_ids uuid[] not null default '{}',
  current_context_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index person_name_idx on public.person (workspace_id, lower(name));
create index person_company_idx on public.person (company_id);
create index person_aliases_idx on public.person using gin (aliases);
create index person_emails_idx on public.person using gin (emails);
create index person_name_trgm_idx on public.person using gin (name extensions.gin_trgm_ops);
create index person_last_interaction_idx
  on public.person (workspace_id, last_interaction desc nulls last);

create trigger person_touch
  before update on public.person
  for each row execute function public.touch_updated_at();

-- ── Project ──────────────────────────────────────────────────────────────────

create table public.project (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  -- What "done" looks like. A project without an outcome cannot be judged
  -- at-risk, so the daily brief skips it.
  outcome text,
  status public.project_status not null default 'not_started',
  owner_person_id uuid references public.person (id) on delete set null,
  company_id uuid references public.company (id) on delete set null,
  deadline date,
  next_action text,
  blockers text[] not null default '{}',

  summary text,
  summary_fact_type public.fact_type not null default 'inference',
  summary_confidence numeric(4, 3) not null default 0
    check (summary_confidence >= 0 and summary_confidence <= 1),
  summary_source_ids uuid[] not null default '{}',
  summary_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index project_name_idx on public.project (workspace_id, lower(name));
create index project_status_idx on public.project (workspace_id, status);
create index project_deadline_idx on public.project (workspace_id, deadline);
create index project_aliases_idx on public.project using gin (aliases);

create trigger project_touch
  before update on public.project
  for each row execute function public.touch_updated_at();

-- ── Meeting ──────────────────────────────────────────────────────────────────

create table public.meeting (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  title text not null,
  occurred_at timestamptz not null,
  company_id uuid references public.company (id) on delete set null,
  project_id uuid references public.project (id) on delete set null,
  -- The transcript this meeting was derived from. Cited by every claim the
  -- meeting summary makes.
  transcript_source_id uuid references public.source (id) on delete set null,
  sentiment public.sentiment not null default 'unknown',
  follow_up_status public.follow_up_status not null default 'pending',
  -- Draft only in Phase 1. Nothing is ever sent.
  follow_up_draft text,

  summary text,
  summary_fact_type public.fact_type not null default 'inference',
  summary_confidence numeric(4, 3) not null default 0
    check (summary_confidence >= 0 and summary_confidence <= 1),
  summary_source_ids uuid[] not null default '{}',
  summary_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meeting_workspace_idx on public.meeting (workspace_id, occurred_at desc);
create index meeting_project_idx on public.meeting (project_id);
create index meeting_company_idx on public.meeting (company_id);

create trigger meeting_touch
  before update on public.meeting
  for each row execute function public.touch_updated_at();

-- ── Task ─────────────────────────────────────────────────────────────────────

create table public.task (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  description text not null,
  owner_person_id uuid references public.person (id) on delete set null,
  -- True when the workspace principal owes this. Drives "waiting on you".
  owned_by_principal boolean not null default false,
  project_id uuid references public.project (id) on delete set null,
  due_date date,
  priority public.priority not null default 'normal',
  status public.task_status not null default 'open',
  commitment_type public.commitment_type not null default 'explicit',

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_workspace_idx on public.task (workspace_id, status, due_date);
create index task_owner_idx on public.task (owner_person_id);
create index task_project_idx on public.task (project_id);
create index task_source_ids_idx on public.task using gin (source_ids);

create trigger task_touch
  before update on public.task
  for each row execute function public.touch_updated_at();

-- ── Decision ─────────────────────────────────────────────────────────────────

create table public.decision (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  statement text not null,
  decided_on date,
  decision_maker_person_id uuid references public.person (id) on delete set null,
  rationale text,
  alternatives text[] not null default '{}',
  reversible boolean,
  review_date date,
  outcome text,
  project_id uuid references public.project (id) on delete set null,
  meeting_id uuid references public.meeting (id) on delete set null,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index decision_workspace_idx on public.decision (workspace_id, decided_on desc nulls last);
create index decision_project_idx on public.decision (project_id);
create index decision_source_ids_idx on public.decision using gin (source_ids);

create trigger decision_touch
  before update on public.decision
  for each row execute function public.touch_updated_at();

-- ── Commitment ───────────────────────────────────────────────────────────────
-- Deliberately separate from `task`. A task is work; a commitment is a promise
-- made to a named person, and the daily brief treats a broken promise as a
-- different kind of failure from an unfinished task.

create table public.commitment (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- Who owes it. Null person + `owed_by_principal` means the user owes it.
  owed_by_person_id uuid references public.person (id) on delete set null,
  owed_by_principal boolean not null default false,
  -- Who it was made to.
  owed_to_person_id uuid references public.person (id) on delete set null,
  owed_to_principal boolean not null default false,
  what text not null,
  deadline date,
  status public.commitment_status not null default 'open',
  commitment_type public.commitment_type not null default 'explicit',
  project_id uuid references public.project (id) on delete set null,
  meeting_id uuid references public.meeting (id) on delete set null,
  task_id uuid references public.task (id) on delete set null,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A promise nobody made and nobody received is not a promise.
  constraint commitment_has_debtor
    check (owed_by_person_id is not null or owed_by_principal),
  constraint commitment_has_creditor
    check (owed_to_person_id is not null or owed_to_principal)
);

create index commitment_workspace_idx on public.commitment (workspace_id, status, deadline);
create index commitment_owed_by_idx on public.commitment (owed_by_person_id);
create index commitment_owed_to_idx on public.commitment (owed_to_person_id);
create index commitment_source_ids_idx on public.commitment using gin (source_ids);
-- "Waiting on you": the principal's open promises, ordered by deadline.
create index commitment_principal_open_idx
  on public.commitment (workspace_id, deadline)
  where owed_by_principal and status in ('open', 'due', 'overdue');

create trigger commitment_touch
  before update on public.commitment
  for each row execute function public.touch_updated_at();
