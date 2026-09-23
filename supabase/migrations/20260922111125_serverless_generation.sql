create or replace function public.nova_enqueue(p_user uuid,p_draft jsonb,p_prompt text,p_key uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.nova_profiles; s public.nova_settings; m public.nova_models; j public.nova_jobs; t public.nova_templates; spent numeric;
begin
 select * into s from public.nova_settings where id=1 for update;
 select * into p from public.nova_profiles where id=p_user for update;
 if p.id is null or not p.active or (p.expires_at is not null and p.expires_at<=now()) then raise exception '账号不可用'; end if;
 select * into j from public.nova_jobs where user_id=p_user and idempotency_key=p_key;
 if found then return to_jsonb(j); end if;
 if s.paused then raise exception '生成服务已暂停'; end if;
 if exists(select 1 from public.nova_jobs where user_id=p_user and status in ('queued','running','uncertain')) then raise exception '已有未完成任务'; end if;
 if p_draft->>'mode'='flagship' and not p.flagship then raise exception '旗舰模式未开通'; end if;
 select * into m from public.nova_models where mode=p_draft->>'mode' and enabled;
 if not found then raise exception '该模式暂未配置模型'; end if;
 if p.credits<m.credit_cost then raise exception '剩余额度不足'; end if;
 if not exists(select 1 from public.nova_assets where id=(p_draft->>'assetId')::uuid and user_id=p_user) then raise exception '素材不存在'; end if;
 select * into t from public.nova_templates where id=p_draft->>'templateId' and enabled;
 if not found then raise exception '模板不可用'; end if;
 -- Budget counts all accepted submissions, even failures: provider may have charged.
 select coalesce(sum(estimated_cost),0) into spent from public.nova_jobs where created_at>=date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
 if spent+m.estimated_cost>s.daily_budget then raise exception '今日预算已用完'; end if;
 update public.nova_profiles set credits=credits-m.credit_cost where id=p_user;
 insert into public.nova_jobs(user_id,draft,template_snapshot,prompt,credits,estimated_cost,model_config_id,model_label,idempotency_key) values(p_user,p_draft,to_jsonb(t),p_prompt,m.credit_cost,m.estimated_cost,m.id,m.provider||' / '||m.model,p_key) returning * into j;
 insert into public.nova_ledger(user_id,job_id,amount,reason) values(p_user,j.id,-m.credit_cost,'任务预留');
 return to_jsonb(j);
end $$;

-- No daemon or queue polling. A compare-and-set claim prevents paid retries.
alter table public.nova_jobs add column last_dispatched_at timestamptz;
create function public.nova_claim_job(p_job uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.nova_jobs; p public.nova_profiles;
begin
 select * into j from public.nova_jobs where id=p_job for update;
 if j.id is null or j.status<>'queued' then return null; end if;
 select * into p from public.nova_profiles where id=j.user_id;
 if p.id is null or not p.active or (p.expires_at is not null and p.expires_at<=now()) or (j.draft->>'mode'='flagship' and not p.flagship) or (select paused from public.nova_settings where id=1) then
  perform public.nova_finish(j.id,'failed',null,'账号不可用或生成服务已暂停'); return null;
 end if;
 update public.nova_jobs set status='running',updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.nova_dispatch_slot(p_job uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.nova_jobs set last_dispatched_at=now() where id=p_job and status='queued' and (last_dispatched_at is null or last_dispatched_at<now()-interval '60 seconds');
 return found;
end $$;
-- Reads reconcile interrupted invocations after the platform's 15-minute limit.
-- Never restart a running model request. Stale queued jobs can safely refund.
create function public.nova_reconcile(p_user uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare j public.nova_jobs;
begin
 for j in select * from public.nova_jobs where (p_user is null or user_id=p_user) and ((status='running' and updated_at<now()-interval '17 minutes') or (status='queued' and created_at<now()-interval '15 minutes')) for update skip locked loop
  if j.status='running' then
   perform public.nova_finish(j.id,'uncertain',null,'云端任务中断，请管理员核对供应商记录后处理，避免重复计费');
  else
   perform public.nova_finish(j.id,'failed',null,'任务未能启动，额度已退回，请稍后重新提交');
  end if;
 end loop;
end $$;
revoke all on function public.nova_claim_job(uuid),public.nova_dispatch_slot(uuid),public.nova_reconcile(uuid) from public,anon,authenticated;
grant execute on function public.nova_claim_job(uuid),public.nova_dispatch_slot(uuid),public.nova_reconcile(uuid) to service_role;
-- Disable obsolete daemon entry points so an old process cannot race new jobs.
drop function public.nova_claim();
drop function public.nova_archive(bigint);
