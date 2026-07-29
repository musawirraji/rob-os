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
