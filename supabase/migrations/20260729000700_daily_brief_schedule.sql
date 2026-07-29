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
