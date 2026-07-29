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
