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
