create function public.nova_update_member(p_actor uuid,p_user uuid,p_active boolean,p_flagship boolean,p_expires timestamptz,p_delta integer) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.nova_profiles where id=p_actor and role='admin' and active and (expires_at is null or expires_at>now())) then raise exception 'Forbidden'; end if;
 if p_actor=p_user and not p_active then raise exception 'Cannot disable current administrator'; end if;
 if abs(p_delta)>100000 then raise exception 'Invalid adjustment'; end if;
 update public.nova_profiles set active=p_active,flagship=p_flagship,expires_at=p_expires,credits=credits+p_delta where id=p_user and credits+p_delta>=0;
 if not found then raise exception '额度不足或用户不存在'; end if;
 if p_delta<>0 then insert into public.nova_ledger(user_id,amount,reason) values(p_user,p_delta,'管理员调整');end if;
 insert into public.nova_audit(actor_id,action,detail) values(p_actor,'member.update',p_user::text||' / delta='||p_delta::text);
end $$;
revoke all on function public.nova_update_member(uuid,uuid,boolean,boolean,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.nova_update_member(uuid,uuid,boolean,boolean,timestamptz,integer) to service_role;
