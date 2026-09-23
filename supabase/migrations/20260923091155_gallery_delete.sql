alter table public.nova_jobs add column deleted_at timestamptz;
create function nova_private.delete_work(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.nova_jobs;
begin
 if auth.uid() is null or not nova_private.active_member() then raise exception '账号未启用或已到期'; end if;
 select * into j from public.nova_jobs where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception '作品不存在'; end if;
 if j.status not in ('succeeded','failed') then raise exception '请等待任务完成或核对后再删除'; end if;
 if j.deleted_at is not null then return; end if;
 update public.nova_jobs set deleted_at=now(),output_path=null where id=p_id;
 insert into public.nova_audit(actor_id,action,detail) values(auth.uid(),'browser.delete-work',p_id::text);
end $$;
revoke all on function nova_private.delete_work(uuid) from public,anon;
grant execute on function nova_private.delete_work(uuid) to authenticated;
create function public.nova_delete_work(p_id uuid) returns void language sql security invoker set search_path='' as $$ select nova_private.delete_work(p_id); $$;
revoke all on function public.nova_delete_work(uuid) from public,anon;
grant execute on function public.nova_delete_work(uuid) to authenticated;
