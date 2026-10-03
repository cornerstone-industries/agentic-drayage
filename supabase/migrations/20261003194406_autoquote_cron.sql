-- Auto trigger (CLAUDE.md section 10). Every minute pg_cron looks for inbound containers that are inside
-- their importer's "auto-quote N days before ETA" window and have no quote request yet, and asks the
-- app to start quotes: POST {app_url}/api/quotes/request with the internal secret and triggeredBy "auto".
--
-- One-time setup in the SQL editor. The target and the secret live in Vault, never in this file:
--   select vault.create_secret('https://YOUR-APP.vercel.app', 'portcall_app_url');
--   select vault.create_secret('<same value as INTERNAL_CRON_SECRET>', 'portcall_cron_secret');
-- Until both exist the tick returns quietly. Check runs with:
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select * from net._http_response order by created desc limit 5;

-- pg_cron goes in pg_catalog: Supabase's own hook grants the postgres role access to the cron schema when
-- the extension is created there. Do not add your own grants on cron; they make a later re-run fail.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create or replace function public.portcall_autoquote_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app_url text;
  v_secret text;
  r record;
begin
  select btrim(s.decrypted_secret, E' \t\r\n') into v_app_url from vault.decrypted_secrets s where s.name = 'portcall_app_url' limit 1;
  select btrim(s.decrypted_secret, E' \t\r\n') into v_secret from vault.decrypted_secrets s where s.name = 'portcall_cron_secret' limit 1;
  if coalesce(v_app_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  v_app_url := regexp_replace(v_app_url, '/+$', '');

  for r in
    select c.id
    from public.containers c
    join public.importers i on i.id = c.importer_id
    where i.auto_quote_enabled
      and c.status = 'inbound'
      and c.eta <= now() + make_interval(days => i.auto_quote_days_before_eta)
      and c.eta > now() - interval '2 days'
      and not exists (select 1 from public.quote_requests q where q.container_id = c.id)
    order by c.eta
  loop
    -- pg_net is async: the request is queued here and sent after this transaction commits.
    perform net.http_post(
      url := v_app_url || '/api/quotes/request',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body := jsonb_build_object('containerId', r.id, 'triggeredBy', 'auto'),
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;

-- Only the cron job (running as postgres) calls this; keep it off the public API.
revoke execute on function public.portcall_autoquote_tick() from public, anon, authenticated;

-- Idempotent schedule: drop the job if it exists, then create it.
select cron.unschedule(jobid) from cron.job where jobname = 'portcall-autoquote';
select cron.schedule('portcall-autoquote', '* * * * *', 'select public.portcall_autoquote_tick()');
