-- Browser-only application: Supabase Auth/RLS/Storage, no application server.
create schema if not exists nova_private;
revoke all on schema nova_private from public;
grant usage on schema nova_private to authenticated;
create function nova_private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nova_profiles where id=(select auth.uid()) and active and (expires_at is null or expires_at>now()));
$$;
create function nova_private.admin_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nova_profiles where id=(select auth.uid()) and role='admin' and active and (expires_at is null or expires_at>now()));
$$;
revoke all on function nova_private.active_member(),nova_private.admin_member() from public,anon;
grant execute on function nova_private.active_member(),nova_private.admin_member() to authenticated;

alter table public.nova_models add column api_key text not null default '';
alter table public.nova_models alter column encrypted_key set default '';
-- Users intentionally receive the enabled model key for direct API calls.
grant select on public.nova_profiles,public.nova_templates,public.nova_models,public.nova_settings,public.nova_jobs,public.nova_assets,public.nova_audit to authenticated;
grant insert,delete on public.nova_assets to authenticated;
create policy browser_profiles on public.nova_profiles for select to authenticated using (id=(select auth.uid()) or (select nova_private.admin_member()));
create policy browser_templates on public.nova_templates for select to authenticated using ((select nova_private.active_member()) and (enabled or (select nova_private.admin_member())));
create policy browser_models on public.nova_models for select to authenticated using ((select nova_private.active_member()) and (enabled or (select nova_private.admin_member())));
create policy browser_settings on public.nova_settings for select to authenticated using ((select nova_private.active_member()));
create policy browser_jobs on public.nova_jobs for select to authenticated using ((select nova_private.active_member()) and (user_id=(select auth.uid()) or (select nova_private.admin_member())));
create policy browser_assets_read on public.nova_assets for select to authenticated using ((select nova_private.active_member()) and user_id=(select auth.uid()));
create policy browser_assets_insert on public.nova_assets for insert to authenticated with check ((select nova_private.active_member()) and user_id=(select auth.uid()) and path=(select auth.uid())::text||'/assets/'||id::text||'.png');
create policy browser_assets_delete on public.nova_assets for delete to authenticated using ((select nova_private.active_member()) and user_id=(select auth.uid()));
create policy browser_audit on public.nova_audit for select to authenticated using ((select nova_private.admin_member()));
create policy browser_storage_read on storage.objects for select to authenticated using (bucket_id='nova-private' and (storage.foldername(name))[1]=(select auth.uid())::text and (select nova_private.active_member()));
create policy browser_storage_insert on storage.objects for insert to authenticated with check (bucket_id='nova-private' and (storage.foldername(name))[1]=(select auth.uid())::text and (select nova_private.active_member()) and lower(storage.extension(name))='png');
create policy browser_storage_delete on storage.objects for delete to authenticated using (bucket_id='nova-private' and (storage.foldername(name))[1]=(select auth.uid())::text and (select nova_private.active_member()));

create table public.nova_invitations (
 email text primary key, token_hash text not null unique, name text not null,
 credits integer not null check(credits between 0 and 100000), flagship boolean not null,
 member_expires_at timestamptz, expires_at timestamptz not null default now()+interval '7 days',
 used_at timestamptz, created_by uuid not null references public.nova_profiles(id)
);
alter table public.nova_invitations enable row level security;
revoke all on public.nova_invitations from anon,authenticated;
grant all on public.nova_invitations to service_role;
create policy no_direct_access on public.nova_invitations for all to anon,authenticated using(false) with check(false);
create function nova_private.accept_invitation() returns trigger language plpgsql security definer set search_path='' as $$
declare invitation public.nova_invitations;
begin
 select * into invitation from public.nova_invitations where email=lower(new.email) and token_hash=encode(extensions.digest(coalesce(new.raw_user_meta_data->>'invite_token',''),'sha256'),'hex') and used_at is null and expires_at>now() for update;
 if invitation.email is null then raise exception '有效邀请链接才能创建账号'; end if;
 if not exists(select 1 from public.nova_profiles where id=invitation.created_by and role='admin' and active and (expires_at is null or expires_at>now())) then raise exception '邀请已失效';end if;
 update public.nova_invitations set used_at=now() where email=invitation.email;
 -- Metadata contains only a token to verify, never an authority or role claim.
 insert into public.nova_profiles(id,email,name,role,credits,flagship,expires_at) values(new.id,lower(new.email),invitation.name,'member',invitation.credits,invitation.flagship,invitation.member_expires_at);
 if invitation.credits>0 then insert into public.nova_ledger(user_id,amount,reason) values(new.id,invitation.credits,'邀请初始额度');end if;
 return new;
end $$;
revoke all on function nova_private.accept_invitation() from public,anon,authenticated;
create trigger nova_accept_invitation after insert on auth.users for each row execute function nova_private.accept_invitation();

-- Authenticated, identity-bound wrapper. Legacy billing functions stay private
-- to service_role; browser callers cannot supply another user's identity.
create function public.nova_browser_action(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); j public.nova_jobs; result jsonb; token text; target uuid;
begin
 if actor is null or not nova_private.active_member() then raise exception '账号未启用或已到期'; end if;
 if p_action='reconcile' then
  for j in select * from public.nova_jobs where (user_id=actor or nova_private.admin_member()) and status in ('queued','running') and updated_at<now()-interval '6 minutes' for update skip locked loop
   perform public.nova_finish(j.id,case when j.status='queued' then 'failed' else 'uncertain' end,null,'浏览器任务已中断或超时，请核对后处理');
  end loop; return '{}'::jsonb;
 elsif p_action='enqueue' then
  if not public.nova_rate_limit('generate:'||actor::text,20,60) then raise exception '提交过于频繁';end if;
  if public.nova_storage_usage()>838860800 then raise exception '图片空间接近免费上限，请先清理作品';end if;
  return public.nova_enqueue(actor,p_data->'draft',p_data->>'prompt',(p_data->>'key')::uuid);
 elsif p_action in ('claim','finish','remove-output') then
  select * into j from public.nova_jobs where id=(p_data->>'id')::uuid and user_id=actor for update;
  if j.id is null then raise exception '任务不存在';end if;
  if p_action='claim' then return public.nova_claim_job(j.id);end if;
  if p_action='remove-output' then
   if j.status<>'succeeded' then raise exception '仅能删除已完成图片';end if;
   update public.nova_jobs set output_path=null where id=j.id;return '{}'::jsonb;
  end if;
  if j.status<>'running' then return '{}'::jsonb;end if;
  if p_data->>'status'='succeeded' and p_data->>'path' is distinct from actor::text||'/outputs/'||j.id::text||'.png' then raise exception '图片路径无效';end if;
  perform public.nova_finish(j.id,p_data->>'status',p_data->>'path',left(p_data->>'error',500));return '{}'::jsonb;
 elsif p_action='storage-usage' then return to_jsonb(public.nova_storage_usage());
 end if;
 if not nova_private.admin_member() then raise exception '仅管理员可执行此操作';end if;
 if p_action='models' then
  if length(p_data->>'apiKey')<8 or length(p_data->>'apiKey')>2048 or p_data->>'endpoint' !~ '^https://' then raise exception '模型配置无效';end if;
  target:=gen_random_uuid();
  perform public.nova_save_model(p_data||jsonb_build_object('id',target,'key_last4',right(p_data->>'apiKey',4),'encrypted_key',''));
  update public.nova_models set api_key=p_data->>'apiKey' where id=target;
 elsif p_action='settings' then
  update public.nova_settings set paused=(p_data->>'paused')::boolean,daily_budget=(p_data->>'daily_budget')::numeric where id=1;
 elsif p_action='member' then
  perform public.nova_update_member(actor,(p_data->>'id')::uuid,(p_data->>'active')::boolean,(p_data->>'flagship')::boolean,(p_data->>'expires_at')::timestamptz,(p_data->>'delta')::integer);
 elsif p_action='invite' then
  if exists(select 1 from public.nova_profiles where lower(email)=lower(p_data->>'email')) then raise exception '该邮箱已有账号';end if;
  token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.nova_invitations(email,token_hash,name,credits,flagship,member_expires_at,created_by) values(lower(p_data->>'email'),encode(extensions.digest(token,'sha256'),'hex'),p_data->>'name',(p_data->>'credits')::integer,(p_data->>'flagship')::boolean,(p_data->>'expires_at')::timestamptz,actor)
  on conflict(email) do update set token_hash=excluded.token_hash,name=excluded.name,credits=excluded.credits,flagship=excluded.flagship,member_expires_at=excluded.member_expires_at,created_by=actor,expires_at=now()+interval '7 days',used_at=null;
  result:=jsonb_build_object('token',token,'email',lower(p_data->>'email'));
 elsif p_action='template' then
  update public.nova_templates set title=p_data->>'title',subtitle=p_data->>'subtitle',details=p_data->>'details',cta=p_data->>'cta',style=p_data->>'style',enabled=(p_data->>'enabled')::boolean where id=p_data->>'id';
 elsif p_action='resolve' then
  select * into j from public.nova_jobs where id=(p_data->>'id')::uuid for update;
  if j.status<>'uncertain' then raise exception '任务状态已变化';end if;
  perform public.nova_finish(j.id,'failed',null,'管理员已核对并关闭任务');
 else raise exception '未知操作';end if;
 insert into public.nova_audit(actor_id,action,detail) values(actor,'browser.'||p_action,coalesce(p_data->>'id',p_data->>'email',p_data->>'model',''));
 return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.nova_browser_action(text,jsonb) from public,anon;
grant execute on function public.nova_browser_action(text,jsonb) to authenticated;
