alter table public.nova_profiles
 add column password_state text not null default 'unknown' check(password_state in ('unknown','temporary','changed')),
 add column password_prompt boolean not null default false,
 add column deletion_pending boolean not null default false,
 add column deleted_at timestamptz;
alter table public.nova_profiles alter column credits set default 2;

create function nova_private.track_password() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.raw_app_meta_data->>'nova_managed'='true' then
   update public.nova_profiles set password_state='temporary',password_prompt=true where id=new.id;
  end if;
 elsif new.encrypted_password is distinct from old.encrypted_password then
  update public.nova_profiles set password_state='changed',password_prompt=false where id=new.id;
 end if;
 return new;
end $$;
revoke all on function nova_private.track_password() from public,anon,authenticated;
create trigger nova_track_password after insert or update of encrypted_password on auth.users for each row execute function nova_private.track_password();

create function nova_private.dismiss_password_prompt() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not nova_private.active_member() then raise exception '账号不可用';end if;
 update public.nova_profiles set password_prompt=false where id=auth.uid();
end $$;
revoke all on function nova_private.dismiss_password_prompt() from public,anon;
grant execute on function nova_private.dismiss_password_prompt() to authenticated;
create function public.nova_dismiss_password_prompt() returns void language sql security invoker set search_path='' as $$select nova_private.dismiss_password_prompt();$$;
revoke all on function public.nova_dismiss_password_prompt() from public,anon;
grant execute on function public.nova_dismiss_password_prompt() to authenticated;

-- A deletion first locks and disables the member, serializing with enqueue.
-- Financial history remains attached to the anonymized profile/Auth tombstone.
create function public.nova_prepare_member_delete(p_actor uuid,p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare target public.nova_profiles;
begin
 if not exists(select 1 from public.nova_profiles where id=p_actor and role='admin' and active and deleted_at is null and (expires_at is null or expires_at>now())) then raise exception '仅管理员可操作';end if;
 select * into target from public.nova_profiles where id=p_user for update;
 if not found or target.role<>'member' or p_actor=p_user then raise exception '只能删除普通成员';end if;
 if exists(select 1 from public.nova_jobs where user_id=p_user and status in ('queued','running','uncertain')) then raise exception '该成员有正在生成或待核对的任务，请先处理任务';end if;
 update public.nova_profiles set active=false,deletion_pending=true where id=p_user;
 insert into public.nova_audit(actor_id,action,detail) values(p_actor,'member.delete.begin',p_user::text);
end $$;
revoke all on function public.nova_prepare_member_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nova_prepare_member_delete(uuid,uuid) to service_role;

create function public.nova_finalize_member_delete(p_actor uuid,p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.nova_profiles where id=p_actor and role='admin' and active and deleted_at is null and (expires_at is null or expires_at>now())) then raise exception '仅管理员可操作';end if;
 if not exists(select 1 from public.nova_profiles where id=p_user and role='member' and deletion_pending) then raise exception '删除尚未开始';end if;
 delete from public.nova_invitations where email=(select email from public.nova_profiles where id=p_user);
 update public.nova_jobs set output_path=null,deleted_at=coalesce(deleted_at,now()) where user_id=p_user;
 delete from public.nova_assets where user_id=p_user;
 update public.nova_profiles set active=false,deleted_at=now(),deletion_pending=false,email=p_user::text||'@deleted.invalid',name='已删除成员',password_state='unknown',password_prompt=false where id=p_user;
 insert into public.nova_audit(actor_id,action,detail) values(p_actor,'member.delete.complete',p_user::text);
end $$;
revoke all on function public.nova_finalize_member_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nova_finalize_member_delete(uuid,uuid) to service_role;

create function nova_private.guard_deleted_profile() returns trigger language plpgsql set search_path='' as $$
begin
 if new.active and (new.deletion_pending or new.deleted_at is not null) then raise exception '删除中的账号不能重新启用';end if;
 return new;
end $$;
revoke all on function nova_private.guard_deleted_profile() from public,anon,authenticated;
create trigger nova_guard_deleted_profile before update on public.nova_profiles for each row execute function nova_private.guard_deleted_profile();
