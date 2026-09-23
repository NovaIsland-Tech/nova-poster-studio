-- All application writes are server mediated. No browser role can call billing/queue RPCs.
create extension if not exists pgmq;
select pgmq.create('nova_generation');
create table public.nova_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, name text not null default '', role text not null default 'member' check(role in ('admin','member')),
 active boolean not null default true, credits integer not null default 0 check(credits>=0), flagship boolean not null default false,
 expires_at timestamptz, created_at timestamptz not null default now()
);
create table public.nova_templates(id text primary key, name text not null, category text not null, tag text not null, color text not null, ink text not null, style text not null, title text not null, subtitle text not null, details text not null, cta text not null, enabled boolean not null default true);
create table public.nova_assets(id uuid primary key, user_id uuid not null references public.nova_profiles(id), path text not null unique, name text not null, created_at timestamptz not null default now());
create index nova_assets_user on public.nova_assets(user_id);
create table public.nova_models(id uuid primary key default gen_random_uuid(), mode text not null check(mode in ('value','flagship')), provider text not null, model text not null, endpoint text not null, adapter text not null check(adapter in ('openai-edit','seedream')), enabled boolean not null default false, credit_cost integer not null check(credit_cost>0), estimated_cost numeric(12,4) not null check(estimated_cost>0), key_last4 text not null, encrypted_key text not null, created_at timestamptz not null default now());
create unique index nova_models_one_active on public.nova_models(mode) where enabled;
create table public.nova_settings(id integer primary key check(id=1), paused boolean not null default false, daily_budget numeric(12,4) not null default 100 check(daily_budget>=0));
insert into public.nova_settings(id) values(1);
create table public.nova_jobs(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.nova_profiles(id), draft jsonb not null, template_snapshot jsonb not null, prompt text not null,
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','uncertain')), credits integer not null check(credits>0), estimated_cost numeric(12,4) not null,
 model_config_id uuid references public.nova_models(id), model_label text not null, output_path text, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), idempotency_key uuid not null, demo boolean not null default false,
 unique(user_id,idempotency_key)
);
create index nova_jobs_user_time on public.nova_jobs(user_id,created_at desc);
create index nova_jobs_cost_time on public.nova_jobs(created_at) include(estimated_cost);
create index nova_jobs_model on public.nova_jobs(model_config_id);
create unique index nova_jobs_one_pending on public.nova_jobs(user_id) where status in ('queued','running','uncertain');
create table public.nova_ledger(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.nova_profiles(id), job_id uuid references public.nova_jobs(id), amount integer not null, reason text not null, created_at timestamptz not null default now());
create index nova_ledger_user on public.nova_ledger(user_id,created_at desc);
create index nova_ledger_job on public.nova_ledger(job_id);
create table public.nova_audit(id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.nova_profiles(id),action text not null,detail text not null,created_at timestamptz not null default now());
create index nova_audit_actor on public.nova_audit(actor_id);
-- service_role only. RLS denies all browser access, including direct REST bypass attempts.
do $$ declare t text; begin foreach t in array array['nova_profiles','nova_templates','nova_assets','nova_models','nova_settings','nova_jobs','nova_ledger','nova_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nova-private','nova-private',false,15728640,array['image/png']);
-- No client Storage policies; images are streamed by authenticated ownership-checked routes.
create function public.nova_enqueue(p_user uuid,p_draft jsonb,p_prompt text,p_key uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 perform pgmq.send('nova_generation',jsonb_build_object('job_id',j.id));
 return to_jsonb(j);
end $$;
create function public.nova_finish(p_job uuid,p_status text,p_path text default null,p_error text default null) returns void language plpgsql security invoker set search_path='' as $$
declare j public.nova_jobs;
begin
 if p_status not in ('succeeded','failed','uncertain') then raise exception 'Invalid status'; end if;
 if p_status='succeeded' and p_path is null then raise exception 'Missing output'; end if;
 select * into j from public.nova_jobs where id=p_job for update;
 if j.id is null or j.status in ('succeeded','failed') then return; end if;
 update public.nova_jobs set status=p_status,output_path=coalesce(p_path,output_path),error=p_error,updated_at=now() where id=p_job;
 if p_status='failed' then
 update public.nova_profiles set credits=credits+j.credits where id=j.user_id;
 insert into public.nova_ledger(user_id,job_id,amount,reason) values(j.user_id,j.id,j.credits,'失败退回');
 end if;
end $$;
create function public.nova_claim() returns jsonb language plpgsql security invoker set search_path='' as $$
declare message pgmq.message_record; j public.nova_jobs; p public.nova_profiles;
begin
 select * into message from pgmq.read('nova_generation',600,1);
 if message.msg_id is null then return null; end if;
 select * into j from public.nova_jobs where id=(message.message->>'job_id')::uuid for update;
 if j.id is null or j.status in ('succeeded','failed','uncertain') then perform pgmq.archive('nova_generation',message.msg_id);return null; end if;
 if j.status='running' then
 perform public.nova_finish(j.id,'uncertain',null,'执行进程中断，请管理员核对供应商记录后处理，避免重复计费');
 perform pgmq.archive('nova_generation',message.msg_id);return null;
 end if;
 select * into p from public.nova_profiles where id=j.user_id;
 if not p.active or (p.expires_at is not null and p.expires_at<=now()) or (select paused from public.nova_settings where id=1) then
 perform public.nova_finish(j.id,'failed',null,'账号不可用或生成服务已暂停');perform pgmq.archive('nova_generation',message.msg_id);return null;
 end if;
 update public.nova_jobs set status='running',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('msg_id',message.msg_id,'job',to_jsonb(j));
end $$;
create function public.nova_archive(p_message bigint) returns void language sql security invoker set search_path='' as $$select pgmq.archive('nova_generation',p_message);$$;
create function public.nova_adjust_credits(p_user uuid,p_delta integer,p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.nova_profiles where id=p_actor and role='admin' and active) then raise exception 'Forbidden'; end if;
 if p_delta=0 or abs(p_delta)>100000 then raise exception 'Invalid adjustment'; end if;
 update public.nova_profiles set credits=credits+p_delta where id=p_user and credits+p_delta>=0;
 if not found then raise exception '额度不足或用户不存在'; end if;
 insert into public.nova_ledger(user_id,amount,reason) values(p_user,p_delta,'管理员调整');
 insert into public.nova_audit(actor_id,action,detail) values(p_actor,'credits.adjust',p_user::text||' / '||p_delta::text);
end $$;
create function public.nova_save_model(p_config jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.nova_settings where id=1 for update;
 if (p_config->>'enabled')::boolean then update public.nova_models set enabled=false where mode=p_config->>'mode'; end if;
 insert into public.nova_models(id,mode,provider,model,endpoint,adapter,enabled,credit_cost,estimated_cost,key_last4,encrypted_key)
 values((p_config->>'id')::uuid,p_config->>'mode',p_config->>'provider',p_config->>'model',p_config->>'endpoint',p_config->>'adapter',(p_config->>'enabled')::boolean,(p_config->>'credit_cost')::integer,(p_config->>'estimated_cost')::numeric,p_config->>'key_last4',p_config->>'encrypted_key');
end $$;
revoke all on function public.nova_enqueue(uuid,jsonb,text,uuid),public.nova_finish(uuid,text,text,text),public.nova_claim(),public.nova_archive(bigint),public.nova_adjust_credits(uuid,integer,uuid),public.nova_save_model(jsonb) from public,anon,authenticated;
grant execute on function public.nova_enqueue(uuid,jsonb,text,uuid),public.nova_finish(uuid,text,text,text),public.nova_claim(),public.nova_archive(bigint),public.nova_adjust_credits(uuid,integer,uuid),public.nova_save_model(jsonb) to service_role;
grant usage on schema pgmq to service_role;
grant all on all tables in schema pgmq to service_role;
grant all on all sequences in schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role;

insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('personal-ip','个人 IP · 自有光芒','人物','个人品牌','#e8e3f3','#3f285f','编辑杂志式构图，主体居右，左侧大面积留白，柔和自然光，克制的淡紫色背景','让热爱，自有回响','分享经验，也分享真实的自己','持续探索 · 保持好奇 · 自由生长','认识我',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('speaker','讲师介绍 · 专业发声','人物','讲师介绍','#d9e7df','#214d3b','清晰专业的讲师介绍，人物居右，深绿色与米白色搭配，左侧留白','把经验，变成影响力','与你一起，找到成长的下一步','实战经验 / 方法分享 / 深度交流','了解更多',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('lifestyle','生活写真 · 此刻日常','人物','生活写真','#ead9c3','#594631','温暖胶片摄影氛围，保留人物特征，生活场景，柔和日光，上方留白','把日子过成喜欢的样子','每一个平凡瞬间，都值得被记住','慢下来，发现生活的小美好','记录此刻',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('course-open','公开课 · 灵感开场','课程','公开课','#e2def6','#443377','当代教育海报，紫色几何结构与柔和渐变，人物或课程素材位于右下角，上方左侧留白','好想法，从这里开始','一堂让灵感落地的公开课','从思路到实践，带走可执行的方法','预约席位',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('course-new','课程上新 · 向前一步','课程','课程上新','#d9e8ed','#235264','清爽蓝色教育海报，阶梯形视觉元素，丰富空间层次，主体居右，左侧留白','下一步，更进一步','系统学习，让成长有迹可循','循序渐进 / 案例拆解 / 实操练习','查看课程',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('course-enroll','招生宣传 · 一起成长','课程','招生宣传','#efdecd','#754329','暖橙色招生海报，柔和圆形几何，亲和可信，主体居右下，顶部留白','和更好的自己见面','新一期学习计划，等你加入','把目标拆小，把行动做实','立即了解',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('product-new','新品发布 · 自然之选','产品','新品发布','#dce4cd','#3c5032','高级护肤品静物摄影，自然苔绿色背景，石材台座与树叶投影，产品居中偏下，顶部充足留白','把自然，带回日常','为每一次日常，注入新的灵感','细节之处，感受用心','探索新品',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('product-detail','产品卖点 · 少即是多','产品','产品卖点','#e6dfd7','#4f4640','极简产品摄影，暖灰色背景，精致光影，产品居中偏右，左上留白，保持包装细节','好设计，自有分寸','简约外表之下，是对细节的坚持','专注体验 / 精选材质 / 日常之选','发现细节',true);
insert into public.nova_templates (id,name,category,tag,color,ink,style,title,subtitle,details,cta,enabled) values ('product-sale','限时活动 · 好物相遇','产品','促销活动','#edcdbf','#7c3727','暖珊瑚色促销海报，鲜明几何构图与轻盈立体台座，产品居右下，左上留白','好物，恰好相遇','把喜欢的生活，带回家','活动信息以实际填写内容为准','即刻选购',true);
