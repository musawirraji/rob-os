-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — complete hosted setup, in one file
--
-- All nine migrations concatenated in order. Paste into the Supabase SQL Editor
-- and Run. Generated from supabase/migrations/ — do not edit by hand; regenerate
-- with `npm run db:bundle` after changing a migration.
--
-- Idempotent enough to re-run on a fresh project. On a project that already has
-- the schema it will error on the first CREATE TYPE — that is expected, and means
-- you have already run it.
--
-- Two extensions must be permitted on the project: `pg_cron` and `pg_net`. If the
-- run fails on either, enable them under Database → Extensions and re-run from
-- that point.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000100_extensions_and_enums.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — extensions and enums
--
-- Extensions live in the `extensions` schema (Supabase convention), so vector
-- types and operator classes are schema-qualified everywhere they appear.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists extensions;

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ── Sources ──────────────────────────────────────────────────────────────────

create type public.source_kind as enum (
  'email',
  'meeting',
  'doc',
  'note',
  'upload',
  'crm'
);

-- Ingestion is a pipeline, and each source sits at exactly one stage. `failed`
-- rows keep their error so a retry is a deliberate act, not a silent re-run.
create type public.source_status as enum (
  'captured',    -- original stored, nothing extracted yet
  'extracting',  -- text extraction in flight
  'chunking',    -- chunked, embeddings pending
  'analyzing',   -- embedded, Claude extraction in flight
  'resolving',   -- entities extracted, resolution in flight
  'ingested',    -- complete
  'failed'
);

-- ── Provenance ───────────────────────────────────────────────────────────────

-- The spine of the product. Anything the system stores declares which of these
-- it is; `inference` and `recommendation` are never rendered as fact.
create type public.fact_type as enum (
  'direct_source_fact',  -- stated verbatim in a source
  'user_stated',         -- the user said it, in the app
  'extracted',           -- pulled out of a source by the model
  'inference',           -- the model's reading across sources
  'recommendation'       -- a suggested next action
);

-- ── People and companies ─────────────────────────────────────────────────────

create type public.relationship_type as enum (
  'client',
  'prospect',
  'investor',
  'advisor',
  'teammate',
  'partner',
  'vendor',
  'unknown'
);

create type public.relationship_strength as enum (
  'strong',
  'steady',
  'cooling',
  'cold',
  'unknown'
);

create type public.company_type as enum (
  'client',
  'prospect',
  'investor',
  'partner',
  'vendor',
  'competitor',
  'unknown'
);

create type public.risk_level as enum ('none', 'low', 'medium', 'high');
create type public.opportunity_level as enum ('none', 'low', 'medium', 'high');

-- ── Projects ─────────────────────────────────────────────────────────────────

create type public.project_status as enum (
  'not_started',
  'on_track',
  'at_risk',
  'slipping',
  'blocked',
  'done',
  'abandoned'
);

-- ── Tasks and commitments ────────────────────────────────────────────────────

create type public.task_status as enum (
  'open',
  'in_progress',
  'waiting',
  'done',
  'dropped'
);

create type public.priority as enum ('low', 'normal', 'high', 'urgent');

-- How the obligation came to exist. `explicit` is quotable; `implied` and
-- `suggested` are the model's reading and must carry a lower confidence.
create type public.commitment_type as enum (
  'explicit',   -- "I'll send it by Friday"
  'implied',    -- follows from what was said, not said outright
  'suggested',  -- the model thinks this should happen
  'delegated',  -- someone else owes it, on the user's behalf
  'waiting'     -- the user is owed it
);

create type public.commitment_status as enum (
  'open',
  'due',
  'overdue',
  'met',
  'broken',
  'released'
);

-- ── Meetings ─────────────────────────────────────────────────────────────────

create type public.sentiment as enum (
  'positive',
  'neutral',
  'tense',
  'negative',
  'unknown'
);

create type public.follow_up_status as enum (
  'none_needed',
  'pending',
  'drafted',
  'sent'
);

-- ── Review queue ─────────────────────────────────────────────────────────────

create type public.review_status as enum (
  'pending',
  'approved',
  'rejected',
  'corrected'
);

-- Why an item needs a human. Each reason maps to a different one-action fix in
-- the Review Queue UI.
create type public.review_reason as enum (
  'low_confidence',
  'ambiguous_entity',
  'conflicting_sources',
  'unparsed_date',
  'inference_needs_confirm'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000200_core_tables.sql
-- ═══════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000300_relationships.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — relationship tables
--
-- Plain Postgres join tables, no graph DB in Phase 1. Every edge carries its own
-- provenance: the fact that two objects are related is itself a claim the model
-- made from a source, and the Review Queue needs to be able to question it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Source ↔ objects ─────────────────────────────────────────────────────────
-- Which objects a given source mentions. This is what makes the activity feed
-- on a Person/Company/Project page possible in one query.

create table public.source_mention (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  source_id uuid not null references public.source (id) on delete cascade,
  person_id uuid references public.person (id) on delete cascade,
  company_id uuid references public.company (id) on delete cascade,
  project_id uuid references public.project (id) on delete cascade,
  meeting_id uuid references public.meeting (id) on delete cascade,
  -- The passage that justified the link, so the chip resolves to real text.
  chunk_id uuid references public.chunk (id) on delete set null,
  excerpt text,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now(),

  -- Exactly one target, so the row is never ambiguous about what it links to.
  constraint source_mention_one_target check (
    (person_id is not null)::int
    + (company_id is not null)::int
    + (project_id is not null)::int
    + (meeting_id is not null)::int = 1
  )
);

create index source_mention_source_idx on public.source_mention (source_id);
create index source_mention_person_idx on public.source_mention (person_id);
create index source_mention_company_idx on public.source_mention (company_id);
create index source_mention_project_idx on public.source_mention (project_id);
create index source_mention_meeting_idx on public.source_mention (meeting_id);

-- ── Person ↔ project ─────────────────────────────────────────────────────────

create table public.project_person (
  project_id uuid not null references public.project (id) on delete cascade,
  person_id uuid not null references public.person (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  role text,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  primary key (project_id, person_id)
);

create index project_person_person_idx on public.project_person (person_id);

-- ── Company ↔ project ────────────────────────────────────────────────────────
-- `project.company_id` holds the primary counterparty; this table carries the
-- rest (a partner, an incumbent vendor being displaced).

create table public.project_company (
  project_id uuid not null references public.project (id) on delete cascade,
  company_id uuid not null references public.company (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  role text,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  primary key (project_id, company_id)
);

create index project_company_company_idx on public.project_company (company_id);

-- ── Meeting ↔ person ─────────────────────────────────────────────────────────

create table public.meeting_person (
  meeting_id uuid not null references public.meeting (id) on delete cascade,
  person_id uuid not null references public.person (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- Named in the transcript but never spoke: still a participant, weaker signal.
  spoke boolean not null default true,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now(),
  primary key (meeting_id, person_id)
);

create index meeting_person_person_idx on public.meeting_person (person_id);

-- ── Person ↔ company ─────────────────────────────────────────────────────────
-- `person.company_id` is the current employer. This keeps the history, so a
-- source from two roles ago still resolves to the right company.

create table public.person_company (
  person_id uuid not null references public.person (id) on delete cascade,
  company_id uuid not null references public.company (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  role text,
  is_current boolean not null default true,
  started_on date,
  ended_on date,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  primary key (person_id, company_id)
);

create index person_company_company_idx on public.person_company (company_id);

-- ── Decision ↔ person ────────────────────────────────────────────────────────
-- `decision.decision_maker_person_id` is who called it; this is everyone else
-- in the room who is affected by it.

create table public.decision_person (
  decision_id uuid not null references public.decision (id) on delete cascade,
  person_id uuid not null references public.person (id) on delete cascade,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  role text,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now(),
  primary key (decision_id, person_id)
);

create index decision_person_person_idx on public.decision_person (person_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000400_operations.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — operational tables
--
-- The audit log, the review queue, and the daily brief. These are what make the
-- AI writes reversible, correctable, and explainable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Audit log ────────────────────────────────────────────────────────────────
-- Every AI write lands here with its previous value. This is what "all AI
-- changes reversible" means in practice: the row is the undo.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- Table name and row id. Deliberately not a foreign key: the log must outlive
  -- the row it describes, including deletions.
  entity_kind text not null,
  entity_id uuid not null,
  action text not null,           -- create | update | merge | delete | approve | reject
  field text,                     -- null when the whole row changed
  reason text,                    -- why the model made this change
  model text,                     -- which model tier and id produced it
  confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  prev_value jsonb,
  new_value jsonb,
  source_ids uuid[] not null default '{}',
  -- Null for autonomous writes; set when a human confirmed it in the queue.
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (workspace_id, entity_kind, entity_id, created_at desc);
create index audit_log_recent_idx on public.audit_log (workspace_id, created_at desc);

-- ── Review queue ─────────────────────────────────────────────────────────────
-- Anything the pipeline was not confident enough to file on its own. The whole
-- point is one action per item: approve, reject, or correct.

create table public.review_item (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  reason public.review_reason not null,
  status public.review_status not null default 'pending',

  -- What the pipeline wants to write, and where.
  entity_kind text not null,
  -- Null for a proposed insert; set when proposing an edit or a merge.
  entity_id uuid,
  proposed jsonb not null,
  -- For `ambiguous_entity`: the candidate rows it could not choose between.
  candidates jsonb not null default '[]'::jsonb,

  fact_type public.fact_type not null default 'extracted',
  confidence numeric(4, 3) not null default 0
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',
  source_id uuid references public.source (id) on delete cascade,
  chunk_id uuid references public.chunk (id) on delete set null,
  -- The passage the user reads when deciding. Without it the queue is guesswork.
  excerpt text,

  -- The user's correction, verbatim. Fed back into resolution so the same
  -- mistake is not made twice.
  correction jsonb,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_item_pending_idx
  on public.review_item (workspace_id, created_at desc)
  where status = 'pending';
create index review_item_source_idx on public.review_item (source_id);

create trigger review_item_touch
  before update on public.review_item
  for each row execute function public.touch_updated_at();

-- ── Resolution memory ────────────────────────────────────────────────────────
-- A correction is only worth making once. When the user says "this 'Sarah' is
-- Sarah Lin, not Sarah Chen", that mapping is stored here and consulted by
-- entity resolution before it asks again.

create table public.resolution_hint (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  entity_kind text not null,            -- person | company | project
  -- The surface form as it appeared in a source, lowercased.
  mention text not null,
  -- Null means "this mention is never an entity" — a rejection is also memory.
  entity_id uuid,
  context_hint text,
  created_from_review_item_id uuid references public.review_item (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index resolution_hint_mention_idx
  on public.resolution_hint (workspace_id, entity_kind, mention);

-- ── Daily brief ──────────────────────────────────────────────────────────────
-- Generated from the model on a schedule, not composed at read time — the Today
-- screen must be instant, and the brief must be stable across a refresh.

create table public.daily_brief (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  brief_date date not null,
  greeting text,
  headline text,
  -- Stat tiles: waiting on you / waiting on others / deals going cold.
  stats jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  model text,

  unique (workspace_id, brief_date)
);

create table public.daily_brief_item (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  brief_id uuid not null references public.daily_brief (id) on delete cascade,
  position int not null,
  -- at_risk | due_today | meeting | good_news | observation
  category text not null,
  body text not null,
  -- The pastel badge on the right of the row.
  badge_label text,
  badge_tone text,              -- good | warn | crit | neutral

  -- What the line links to. Every line links to something, or it does not ship.
  person_id uuid references public.person (id) on delete set null,
  company_id uuid references public.company (id) on delete set null,
  project_id uuid references public.project (id) on delete set null,
  meeting_id uuid references public.meeting (id) on delete set null,
  commitment_id uuid references public.commitment (id) on delete set null,

  fact_type public.fact_type not null default 'inference',
  confidence numeric(4, 3) not null default 0
    check (confidence >= 0 and confidence <= 1),
  source_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  unique (brief_id, position)
);

create index daily_brief_item_brief_idx on public.daily_brief_item (brief_id, position);

-- ── Ask log ──────────────────────────────────────────────────────────────────
-- Every question and the exact answer given, with what was retrieved and what
-- the engine abstained on. This is the record that makes the grounding claim
-- checkable after the fact rather than a promise.

create table public.ask_query (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  asked_by uuid references auth.users (id) on delete set null,
  question text not null,
  answer text,
  -- False when any part of the question could not be answered from a source.
  grounded boolean not null default false,
  -- The sub-questions the engine refused to guess at.
  abstained text[] not null default '{}',
  -- Chunk ids handed to synthesis, in rank order.
  retrieved_chunk_ids uuid[] not null default '{}',
  cited_source_ids uuid[] not null default '{}',
  model text,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index ask_query_workspace_idx on public.ask_query (workspace_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000500_rls.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — row level security
--
-- The rule from the brief: RLS on every table, no public policy, all access via
-- the service role in server code. So this migration enables (and forces) RLS
-- everywhere and creates *zero* policies — with RLS on and no policy, Postgres
-- denies every row to `anon` and `authenticated`. `service_role` carries
-- BYPASSRLS, so server code is unaffected.
--
-- The loop is deliberate: a table added later without a matching policy is
-- locked down by default, and the assertion at the bottom fails the migration if
-- anything in `public` was missed.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    -- FORCE also applies RLS to the table owner. BYPASSRLS roles
    -- (`postgres`, `service_role`) are still exempt, which is what we want.
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end;
$$;

-- Belt and braces: even with RLS denying every row, the client-facing roles
-- should not hold table privileges in the first place.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- New objects created later inherit the same posture.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Fails the migration rather than shipping a table that is quietly readable.

do $$
declare
  unprotected text[];
  with_policies text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if array_length(unprotected, 1) is not null then
    raise exception 'RLS is not enabled and forced on: %', array_to_string(unprotected, ', ');
  end if;

  select coalesce(array_agg(distinct tablename order by tablename), '{}')
  into with_policies
  from pg_policies
  where schemaname = 'public';

  if array_length(with_policies, 1) is not null then
    raise exception
      'Phase 1 expects no public policies, found some on: %',
      array_to_string(with_policies, ', ');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000600_match_chunks.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — hybrid retrieval
--
-- `match_chunks` is the retrieval half of the grounding contract. Vector search
-- alone misses exact tokens (a price, a date, a product name); full-text alone
-- misses paraphrase. Both matter here — "what did I promise Sarah" needs the
-- paraphrase, "the £48k tier" needs the literal.
--
-- Fusion is Reciprocal Rank Fusion rather than a weighted score blend: cosine
-- distance and ts_rank are not on the same scale, so combining the raw numbers
-- would let whichever happens to be larger dominate. RRF only uses each result's
-- rank within its own list, which is scale-free.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_chunks(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1024) default null,
  p_query_text text default null,
  p_match_count int default 12,
  -- Nudge these per query plan: a "find the exact wording" question wants more
  -- full text, a "what's the situation with X" question wants more semantic.
  p_semantic_weight double precision default 1.0,
  p_full_text_weight double precision default 1.0,
  -- RRF smoothing constant. 50 is the usual default; higher flattens the
  -- advantage of being rank 1.
  p_rrf_k int default 50,
  -- Restrict to sources that happened on or after this instant.
  p_since timestamptz default null,
  -- Restrict to particular kinds of source, e.g. only meetings.
  p_source_kinds public.source_kind[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_kind public.source_kind,
  source_title text,
  occurred_at timestamptz,
  content text,
  token_start int,
  token_end int,
  semantic_rank int,
  full_text_rank int,
  score double precision
)
language sql
stable
security definer
-- Pinned so the function cannot be hijacked by a caller's search_path.
set search_path = public, extensions, pg_temp
as $$
  with
  -- Over-fetch from each arm so the fusion has something to work with; a chunk
  -- ranked 30th semantically can still win once full text agrees with it.
  candidate_pool as (
    select greatest(p_match_count * 4, 40) as n
  ),
  scoped as (
    select c.id, c.embedding, c.fts
    from public.chunk c
    join public.source s on s.id = c.source_id
    where c.workspace_id = p_workspace_id
      and (p_since is null or s.occurred_at >= p_since)
      and (p_source_kinds is null or s.kind = any (p_source_kinds))
  ),
  semantic as (
    select
      scoped.id,
      row_number() over (order by scoped.embedding <=> p_query_embedding) as rank
    from scoped, candidate_pool
    where p_query_embedding is not null
      and scoped.embedding is not null
    order by scoped.embedding <=> p_query_embedding
    limit (select n from candidate_pool)
  ),
  -- `websearch_to_tsquery` and `plainto_tsquery` both AND every term together,
  -- which is wrong for a natural-language question: "What did I promise Sarah this
  -- week?" would only match a chunk containing *all* of those words, and matches
  -- nothing. So the query text is lexed with `to_tsvector` — which drops
  -- stopwords and stems — and the surviving lexemes are OR-ed. `ts_rank_cd` then
  -- does the discriminating, rewarding chunks that match more terms, closer
  -- together. Lexemes are quoted because a stemmed token can contain characters
  -- that are operators in tsquery syntax.
  parsed_query as (
    select case
      when p_query_text is null or btrim(p_query_text) = '' then null
      else (
        select nullif(string_agg(quote_literal(l.lexeme), ' | '), '')::tsquery
        from unnest(to_tsvector('english', p_query_text)) as l(lexeme, positions, weights)
      )
    end as tsq
  ),
  full_text as (
    select
      scoped.id,
      row_number() over (
        order by ts_rank_cd(scoped.fts, parsed_query.tsq) desc
      ) as rank
    from scoped, parsed_query, candidate_pool
    where parsed_query.tsq is not null
      and scoped.fts @@ parsed_query.tsq
    order by ts_rank_cd(scoped.fts, parsed_query.tsq) desc
    limit (select n from candidate_pool)
  ),
  fused as (
    select
      coalesce(semantic.id, full_text.id) as id,
      semantic.rank as semantic_rank,
      full_text.rank as full_text_rank,
      coalesce(1.0 / (p_rrf_k + semantic.rank), 0.0) * p_semantic_weight
        + coalesce(1.0 / (p_rrf_k + full_text.rank), 0.0) * p_full_text_weight
        as score
    from semantic
    full outer join full_text on semantic.id = full_text.id
  )
  select
    c.id,
    c.source_id,
    s.kind,
    s.title,
    s.occurred_at,
    c.content,
    c.token_start,
    c.token_end,
    fused.semantic_rank::int,
    fused.full_text_rank::int,
    fused.score
  from fused
  join public.chunk c on c.id = fused.id
  join public.source s on s.id = c.source_id
  order by fused.score desc, s.occurred_at desc nulls last
  limit p_match_count;
$$;

comment on function public.match_chunks is
  'Hybrid retrieval over chunk: pgvector cosine + Postgres full text, fused with '
  'Reciprocal Rank Fusion. Server-side only; never exposed to anon.';

-- Server code only. The Ask engine runs under the service role.
revoke all on function public.match_chunks(
  uuid, extensions.vector(1024), text, int, double precision, double precision,
  int, timestamptz, public.source_kind[]
) from public, anon, authenticated;

grant execute on function public.match_chunks(
  uuid, extensions.vector(1024), text, int, double precision, double precision,
  int, timestamptz, public.source_kind[]
) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000700_daily_brief_schedule.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — scheduled daily brief
--
-- The brief rules live in TypeScript (`features/today/domain/brief.ts`), so the
-- schedule reaches back into the application over HTTP rather than
-- reimplementing them in PL/pgSQL. Two implementations of "what matters today"
-- would drift, and the one the user reads has to be the one the job wrote.
--
-- `pg_cron` fires; `pg_net` makes the request. Both are Supabase-provided.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Where to call and what to authenticate with. A table rather than a GUC so the
-- values survive a restart and can be rotated with an update.
create table if not exists public.cron_config (
  id boolean primary key default true constraint cron_config_singleton check (id),
  app_url text not null,
  cron_secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.cron_config enable row level security;
alter table public.cron_config force row level security;
revoke all on table public.cron_config from anon, authenticated;
grant all on table public.cron_config to service_role;

comment on table public.cron_config is
  'Single row. Set app_url and cron_secret to arm the daily-brief schedule.';

-- ── The job ──────────────────────────────────────────────────────────────────

create or replace function public.trigger_daily_brief()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  config public.cron_config;
begin
  select * into config from public.cron_config where id;

  -- Unconfigured is a normal state, not an error: the brief still regenerates
  -- when Today is opened. Raise a notice and stop rather than failing the job
  -- every morning in an environment that was never meant to schedule it.
  if config is null or coalesce(config.app_url, '') = '' then
    raise notice 'daily brief: cron_config is empty, skipping';
    return;
  end if;

  perform extensions.http_post(
    url := config.app_url || '/api/cron/daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || config.cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.trigger_daily_brief() from public, anon, authenticated;
grant execute on function public.trigger_daily_brief() to service_role;

-- 06:00 UTC daily. Unscheduled first so re-running this migration is safe.
do $$
begin
  perform cron.unschedule('rob-os-daily-brief');
exception
  when others then null;  -- not scheduled yet
end;
$$;

select cron.schedule(
  'rob-os-daily-brief',
  '0 6 * * *',
  $$select public.trigger_daily_brief();$$
);

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000800_relationship_keys.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — upsert keys for idempotent relationship writes
--
-- The ingestion pipeline must be safe to re-run, which means every row it writes
-- needs a key it can upsert on. The relationship tables already have composite
-- primary keys; a meeting derived from a transcript did not, so re-ingesting a
-- transcript would have created a second meeting for the same source.
--
-- Plain (not partial) unique index, because `on conflict` cannot infer a partial
-- one. Nulls are distinct, so meetings with no transcript stay unconstrained.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index meeting_transcript_source_idx
  on public.meeting (transcript_source_id);

-- Relationship edges carry the sources that justify them, so the ingestion job
-- can find and refresh the ones it wrote.
create index project_person_source_ids_idx
  on public.project_person using gin (source_ids);
create index project_company_source_ids_idx
  on public.project_company using gin (source_ids);
create index person_company_source_ids_idx
  on public.person_company using gin (source_ids);

-- `meeting_person` and `decision_person` are scoped by their parent object
-- rather than by source, so they need no source index — deleting the meeting or
-- decision removes them.

-- Re-assert the posture from 20260729000500 now that later migrations have added
-- tables. Cheap, and it fails the migration rather than shipping a readable table.
do $$
declare
  unprotected text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if array_length(unprotected, 1) is not null then
    raise exception 'RLS is not enabled and forced on: %', array_to_string(unprotected, ', ');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260729000900_storage.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — storage for original artefacts
--
-- Brief §7 step 1: store the original immediately. The extracted text on
-- `source.body` is what we chunk and cite, but the original is the ground truth —
-- if a citation ever looks wrong, the only way to settle it is to open the file
-- the claim came from.
--
-- Private bucket with no policies, matching the table posture: `anon` and
-- `authenticated` get nothing, and server code reaches it with the service role.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sources',
  'sources',
  false,
  -- 25 MB. Large enough for a scanned deck, small enough that a mis-drop fails
  -- fast rather than filling the disk.
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/csv',
    'message/rfc822',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created. With RLS on `storage.objects` (Supabase enables
-- it by default) and no policy for this bucket, only the service role can read or
-- write it — the same rule as every table in `public`.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'sources') then
    raise exception 'the sources bucket was not created';
  end if;
end;
$$;
