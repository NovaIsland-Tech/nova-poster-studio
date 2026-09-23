create index nova_invitations_created_by on public.nova_invitations(created_by);
do $$ declare t text;begin foreach t in array array['nova_profiles','nova_templates','nova_assets','nova_models','nova_settings','nova_jobs','nova_audit'] loop
 execute format('drop policy server_only on public.%I',t);
end loop;end $$;
alter table public.nova_settings add column browser_invites_enabled boolean not null default false;
-- Keep privileged code outside the exposed API schema. It still checks uid,
-- membership and admin authority internally, even when called via SQL.
alter function public.nova_browser_action(text,jsonb) set schema nova_private;
create function public.nova_browser_action(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_action='invite' and not coalesce((select browser_invites_enabled from public.nova_settings where id=1),false) then raise exception '邀请开户尚未启用，请先完成认证设置确认';end if;
 return nova_private.nova_browser_action(p_action,p_data);
end $$;
revoke all on function public.nova_browser_action(text,jsonb) from public,anon;
grant execute on function public.nova_browser_action(text,jsonb) to authenticated;
