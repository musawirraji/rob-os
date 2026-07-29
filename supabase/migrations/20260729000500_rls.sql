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
