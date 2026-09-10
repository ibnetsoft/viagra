-- Announcements are immutable once published. Recipients are snapshotted at publication.
create table public.announcements (
 id uuid primary key, title text not null check(length(trim(title)) between 1 and 120),
 body text not null check(length(trim(body)) between 1 and 5000),
 target_mode text not null check(target_mode in ('all','selected')), target_ids uuid[] not null default '{}',
 revision integer not null default 1,push_enabled boolean not null default true, status text not null default 'draft' check(status in ('draft','published')),
 created_by uuid not null references public.members(id),created_at timestamptz not null default now(),published_at timestamptz
);
create table public.announcement_recipients (
 announcement_id uuid not null references public.announcements(id),member_id uuid not null references public.members(id),
 read_at timestamptz,primary key(announcement_id,member_id)
);
create index announcement_member_idx on public.announcement_recipients(member_id,read_at,announcement_id);
create index announcements_created_idx on public.announcements(created_at desc,id);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id),
 endpoint text not null unique check(length(endpoint)<=2048),p256dh text not null,auth_key text not null,
 created_at timestamptz not null default now(),disabled_at timestamptz
);
create index push_member_idx on public.push_subscriptions(member_id);
create table public.push_deliveries (
 id uuid primary key default gen_random_uuid(),announcement_id uuid not null references public.announcements(id),
 subscription_id uuid not null references public.push_subscriptions(id),member_id uuid not null references public.members(id),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','expired','cancelled')),
 attempts integer not null default 0,last_error text,next_attempt_at timestamptz not null default now(),
 locked_at timestamptz,lease_token uuid,sent_at timestamptz,created_at timestamptz not null default now(),
 unique(announcement_id,subscription_id)
);
create index push_pending_idx on public.push_deliveries(status,next_attempt_at);
create index push_announcement_idx on public.push_deliveries(announcement_id);
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.announcements,public.announcement_recipients,public.push_subscriptions,public.push_deliveries from public,anon,authenticated;
grant select on public.announcements,public.announcement_recipients to authenticated;
grant all on public.announcements,public.announcement_recipients,public.push_subscriptions,public.push_deliveries to service_role;
create policy recipient_read on public.announcement_recipients for select to authenticated using((select private.is_admin()) or (member_id=(select auth.uid()) and exists(select 1 from public.members where id=(select auth.uid()) and status='active')));
create policy announcement_read on public.announcements for select to authenticated using((select private.is_admin()) or (status='published' and id in(select announcement_id from public.announcement_recipients where member_id=(select auth.uid()))));

create function private.save_announcement(p_id uuid,p_title text,p_body text,p_mode text,p_targets uuid[],p_push boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
 perform private.require_admin();
 if p_id is null or p_push is null or p_mode is null or p_mode not in ('all','selected') or length(trim(coalesce(p_title,''))) not between 1 and 120 or length(trim(coalesce(p_body,''))) not between 1 and 5000 then raise exception '제목과 내용을 확인하세요.';end if;
 if p_mode='selected' and (coalesce(cardinality(p_targets),0) not between 1 and 500 or array_position(p_targets,null) is not null) then raise exception '수신 회원을 선택하세요. (최대 500명)';end if;
 insert into public.announcements(id,title,body,target_mode,target_ids,push_enabled,created_by)
 values(p_id,trim(p_title),trim(p_body),p_mode,case when p_mode='all' then '{}'::uuid[] else p_targets end,p_push,auth.uid())
 on conflict(id) do update set title=excluded.title,body=excluded.body,target_mode=excluded.target_mode,target_ids=excluded.target_ids,push_enabled=excluded.push_enabled,revision=announcements.revision+1 where announcements.status='draft' returning revision into rev;
 if not found then raise exception '발송한 공지는 수정할 수 없습니다. 새 공지를 작성하세요.';end if;
 return jsonb_build_object('id',p_id,'revision',rev);
end $$;
create function private.publish_announcement(p_id uuid,p_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare a public.announcements;n integer;
begin
 perform private.require_admin();
 select * into a from public.announcements where id=p_id for update;
 if not found then raise exception '공지를 찾을 수 없습니다.';end if;
 if a.status='published' then return (select count(*)::integer from public.announcement_recipients where announcement_id=p_id);end if;
 if p_revision is null or a.revision<>p_revision then raise exception '다른 관리자가 공지를 수정했습니다. 다시 확인하세요.';end if;
 if a.target_mode='selected' and exists(select 1 from unnest(a.target_ids) t(id) where not exists(select 1 from public.members m where m.id=t.id and m.status='active')) then raise exception '수신 대상에 정지 또는 삭제된 회원이 있습니다. 대상을 다시 확인하세요.';end if;
 insert into public.announcement_recipients(announcement_id,member_id) select p_id,id from public.members where status='active' and (a.target_mode='all' or id=any(a.target_ids));
 get diagnostics n=row_count;
 if n=0 then raise exception '발송할 회원이 없습니다.';end if;
 update public.announcements set status='published',published_at=now() where id=p_id;
 if a.push_enabled then
 insert into public.push_deliveries(announcement_id,subscription_id,member_id)
 select p_id,s.id,s.member_id from public.push_subscriptions s join public.announcement_recipients r on r.member_id=s.member_id and r.announcement_id=p_id where s.disabled_at is null;
 end if;
 insert into public.audits(action,actor,detail) values('공지 발송',auth.uid()::text,p_id||' · 수신 '||n||'명');
 return n;
end $$;
create function private.read_announcement(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.members where id=auth.uid() and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 update public.announcement_recipients set read_at=coalesce(read_at,now()) where member_id=auth.uid() and (p_id is null or announcement_id=p_id);
end $$;
create function private.subscribe_push(p_endpoint text,p_key text,p_auth text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();sub public.push_subscriptions;sid uuid;
begin
 if me is null or not exists(select 1 from public.members where id=me and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])+notify[.]windows[.]com)/[^[:space:]]+$' or p_key is null or p_key !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception '지원하지 않는 푸시 구독 정보입니다.';end if;
 perform pg_advisory_xact_lock(hashtext(me::text));
 select * into sub from public.push_subscriptions where endpoint=p_endpoint;
 if found and sub.member_id<>me then raise exception '다른 계정의 기기 등록입니다. 알림을 끈 뒤 다시 켜주세요.';end if;
 if not found and (select count(*) from public.push_subscriptions where member_id=me and disabled_at is null)>=20 then raise exception '등록 가능한 기기 수를 초과했습니다.';end if;
 insert into public.push_subscriptions(member_id,endpoint,p256dh,auth_key) values(me,p_endpoint,p_key,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,disabled_at=null where push_subscriptions.member_id=me returning id into sid;
 if not found then raise exception '다른 계정의 기기 등록입니다. 알림을 끈 뒤 다시 켜주세요.';end if;
 return sid;
end $$;
create function private.unsubscribe_push(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 update public.push_subscriptions set disabled_at=now() where id=p_id and member_id=auth.uid();
 update public.push_deliveries set status='cancelled' where subscription_id=p_id and member_id=auth.uid() and status in('pending','sending');
end $$;
create function private.my_push_status(p_endpoint text) returns uuid language sql stable security definer set search_path='' as $$
 select s.id from public.push_subscriptions s join public.members m on m.id=s.member_id where s.member_id=auth.uid() and s.endpoint=p_endpoint and s.disabled_at is null and m.status='active'
$$;
create function private.announcement_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc),'[]'::jsonb) from (
 select a.*,(select count(*) from public.announcement_recipients r where r.announcement_id=a.id) recipients,
 (select count(*) from public.announcement_recipients r where r.announcement_id=a.id and r.read_at is not null) reads,
 (select count(*) from public.push_deliveries d where d.announcement_id=a.id and d.status in('pending','sending')) push_pending,
 (select count(*) from public.push_deliveries d where d.announcement_id=a.id and d.status='sent') push_sent,
 (select count(*) from public.push_deliveries d where d.announcement_id=a.id and d.status in('failed','expired','cancelled')) push_failed
 from public.announcements a order by a.created_at desc limit 100) t);
end $$;
-- Worker has a separate service-only grant. No client role can claim endpoints or keys.
create function private.claim_push_jobs(p_limit integer) returns table(id uuid,announcement_id uuid,subscription_id uuid,member_id uuid,attempts integer,lease_token uuid,endpoint text,p256dh text,auth_key text)
language plpgsql security definer set search_path='' as $$
begin
 update public.push_deliveries d set status='cancelled' where d.status in('pending','sending') and not exists(select 1 from public.push_subscriptions s join public.members m on m.id=s.member_id where s.id=d.subscription_id and s.member_id=d.member_id and s.disabled_at is null and m.status='active');
 update public.push_deliveries d set status='expired',last_error='전송 기한 만료' where d.status in('pending','sending') and (d.created_at<now()-interval '24 hours' or (d.attempts>=5 and d.locked_at<now()-interval '5 minutes'));
 return query
 with selected as (select d.id from public.push_deliveries d where d.attempts<5 and ((d.status='pending' and d.next_attempt_at<=now()) or (d.status='sending' and d.locked_at<now()-interval '5 minutes')) order by d.created_at,d.id for update skip locked limit least(greatest(p_limit,1),20)),
 claimed as (update public.push_deliveries d set status='sending',attempts=d.attempts+1,locked_at=now(),lease_token=gen_random_uuid() from selected s where d.id=s.id returning d.*)
 select c.id,c.announcement_id,c.subscription_id,c.member_id,c.attempts,c.lease_token,s.endpoint,s.p256dh,s.auth_key from claimed c join public.push_subscriptions s on s.id=c.subscription_id;
end $$;

create function public.save_announcement(p_id uuid,p_title text,p_body text,p_mode text,p_targets uuid[],p_push boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.save_announcement(p_id,p_title,p_body,p_mode,p_targets,p_push) $$;
revoke all on function public.save_announcement(uuid,text,text,text,uuid[],boolean),private.save_announcement(uuid,text,text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.save_announcement(uuid,text,text,text,uuid[],boolean),private.save_announcement(uuid,text,text,text,uuid[],boolean) to authenticated;

create function public.publish_announcement(p_id uuid,p_revision integer) returns integer language sql security invoker set search_path='' as $$ select private.publish_announcement(p_id,p_revision) $$;
revoke all on function public.publish_announcement(uuid,integer),private.publish_announcement(uuid,integer) from public,anon,authenticated;
grant execute on function public.publish_announcement(uuid,integer),private.publish_announcement(uuid,integer) to authenticated;

create function public.read_announcement(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.read_announcement(p_id) $$;
revoke all on function public.read_announcement(uuid),private.read_announcement(uuid) from public,anon,authenticated;
grant execute on function public.read_announcement(uuid),private.read_announcement(uuid) to authenticated;

create function public.subscribe_push(p_endpoint text,p_key text,p_auth text) returns uuid language sql security invoker set search_path='' as $$ select private.subscribe_push(p_endpoint,p_key,p_auth) $$;
revoke all on function public.subscribe_push(text,text,text),private.subscribe_push(text,text,text) from public,anon,authenticated;
grant execute on function public.subscribe_push(text,text,text),private.subscribe_push(text,text,text) to authenticated;

create function public.unsubscribe_push(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.unsubscribe_push(p_id) $$;
revoke all on function public.unsubscribe_push(uuid),private.unsubscribe_push(uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_push(uuid),private.unsubscribe_push(uuid) to authenticated;

create function public.my_push_status(p_endpoint text) returns uuid language sql security invoker set search_path='' as $$ select private.my_push_status(p_endpoint) $$;
revoke all on function public.my_push_status(text),private.my_push_status(text) from public,anon,authenticated;
grant execute on function public.my_push_status(text),private.my_push_status(text) to authenticated;

create function public.announcement_stats() returns jsonb language sql security invoker set search_path='' as $$ select private.announcement_stats() $$;
revoke all on function public.announcement_stats(),private.announcement_stats() from public,anon,authenticated;
grant execute on function public.announcement_stats(),private.announcement_stats() to authenticated;

create function public.claim_push_jobs(p_limit integer) returns table(id uuid,announcement_id uuid,subscription_id uuid,member_id uuid,attempts integer,lease_token uuid,endpoint text,p256dh text,auth_key text) language sql security invoker set search_path='' as $$ select * from private.claim_push_jobs(p_limit) $$;
revoke all on function public.claim_push_jobs(integer),private.claim_push_jobs(integer) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.claim_push_jobs(integer),private.claim_push_jobs(integer) to service_role;

grant select on public.members to service_role;

create function private.member_announcements(p_page integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid();result jsonb;
begin
 if me is null or not exists(select 1 from public.members where id=me and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 10000 then raise exception '페이지 오류';end if;
 select jsonb_build_object('items',coalesce((select jsonb_agg(row_to_json(t) order by t.published_at desc,t.id desc) from (
 select a.id,a.published_at,r.read_at,jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'published_at',a.published_at) announcements
 from public.announcement_recipients r join public.announcements a on a.id=r.announcement_id where r.member_id=me and a.status='published' order by a.published_at desc,a.id desc limit 30 offset p_page*30) t),'[]'::jsonb),
 'unread',(select count(*) from public.announcement_recipients where member_id=me and read_at is null)) into result;
 return result;
end $$;
create function public.member_announcements(p_page integer) returns jsonb language sql security invoker set search_path='' as $$ select private.member_announcements(p_page) $$;
revoke all on function public.member_announcements(integer),private.member_announcements(integer) from public,anon,authenticated;
grant execute on function public.member_announcements(integer),private.member_announcements(integer) to authenticated;
