create table public.nova_rate_limits(key text primary key,hits integer not null,window_start timestamptz not null);
alter table public.nova_rate_limits enable row level security;
revoke all on public.nova_rate_limits from anon,authenticated;
grant all on public.nova_rate_limits to service_role;
create function public.nova_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.nova_rate_limits(key,hits,window_start) values(p_key,1,now())
 on conflict(key) do update set hits=case when public.nova_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else public.nova_rate_limits.hits+1 end,
 window_start=case when public.nova_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else public.nova_rate_limits.window_start end returning hits into n;
 return n<=p_limit;
end $$;
create function public.nova_storage_usage() returns bigint language sql security invoker set search_path='' as $$select coalesce(sum((metadata->>'size')::bigint),0)::bigint from storage.objects where bucket_id='nova-private';$$;
create table public.nova_worker_status(id integer primary key check(id=1),last_seen timestamptz not null default now());
alter table public.nova_worker_status enable row level security;
revoke all on public.nova_worker_status from anon,authenticated;
grant all on public.nova_worker_status to service_role;
revoke all on function public.nova_rate_limit(text,integer,integer),public.nova_storage_usage() from public,anon,authenticated;
grant execute on function public.nova_rate_limit(text,integer,integer),public.nova_storage_usage() to service_role;
-- Explicit deny policies document the server-only data boundary.
do $$ declare t text; begin foreach t in array array['nova_profiles','nova_templates','nova_assets','nova_models','nova_settings','nova_jobs','nova_ledger','nova_audit','nova_rate_limits','nova_worker_status'] loop
 execute format('create policy server_only on public.%I for all to anon,authenticated using (false) with check (false)',t);
end loop;end $$;
