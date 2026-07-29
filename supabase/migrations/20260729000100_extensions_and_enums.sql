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
