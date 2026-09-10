create or replace function private.my_organization(p_mode text,p_root uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); root_id uuid:=coalesce(p_root,auth.uid()); allowed boolean; root_node jsonb; children jsonb; total integer;
begin
 if me is null or not exists(select 1 from public.members where role='member' and id=me and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_mode not in ('referral','sponsor') or p_mode is null or p_offset is null or p_offset<0 then raise exception '조직도 조회 조건을 확인하세요.'; end if;
 with recursive ancestors as (
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end as parent from public.members m where m.role='member' and m.id=root_id
 union
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end from public.members m join ancestors a on m.id=a.parent where m.role='member'
 ) select exists(select 1 from ancestors where id=me) into allowed;
 if not allowed then raise exception '본인 산하만 조회할 수 있습니다.' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'name',name,'member_code',member_code,'position',case when p_mode='sponsor' then position else null end) into root_node from public.members where role='member' and id=root_id;
 select count(*) into total from public.members where role='member' and case when p_mode='referral' then referrer_id else sponsor_id end=root_id;
 select coalesce(jsonb_agg(n.node order by n.member_code,n.id),'[]'::jsonb) into children from (
 select m.id,m.member_code,jsonb_build_object('id',m.id,'name',m.name,'member_code',m.member_code,'position',case when p_mode='sponsor' then m.position else null end,
 'has_children',exists(select 1 from public.members c where c.role='member' and case when p_mode='referral' then c.referrer_id else c.sponsor_id end=m.id)) node
 from public.members m where m.role='member' and case when p_mode='referral' then m.referrer_id else m.sponsor_id end=root_id
 order by m.member_code,m.id limit 50 offset p_offset) n;
 return jsonb_build_object('root',root_node,'children',children,'total',total);
end $$;

-- Admin accounts remain authentication/audit actors, never network participants.
create function private.member_network_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(870031);
 if new.role='admin' then
  if new.referrer_id is not null or new.sponsor_id is not null or new.position is not null or new.center_id is not null or exists(select 1 from public.members where referrer_id=new.id or sponsor_id=new.id) or exists(select 1 from public.centers where owner_id=new.id) then raise exception '관리자는 회원 조직 또는 센터에 배정할 수 없습니다.';end if;
 end if;
 if exists(select 1 from public.members where id in(new.referrer_id,new.sponsor_id) and role='admin') then raise exception '관리자를 추천인 또는 후원인으로 지정할 수 없습니다.';end if;
 return new;
end $$;
revoke all on function private.member_network_guard() from public,anon,authenticated;
create trigger member_network_guard before insert or update of role,referrer_id,sponsor_id,position,center_id on public.members for each row execute function private.member_network_guard();
create function private.member_participant_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(870031);
 target:=case when tg_table_name='centers' then (to_jsonb(new)->>'owner_id')::uuid else (to_jsonb(new)->>'member_id')::uuid end;
 if not exists(select 1 from public.members where id=target and role='member') then raise exception '관리자는 회원 충전·구매 또는 센터 지정 대상이 아닙니다.';end if;
 return new;
end $$;
revoke all on function private.member_participant_guard() from public,anon,authenticated;
create trigger center_member_guard before insert or update of owner_id on public.centers for each row execute function private.member_participant_guard();
create trigger topup_member_guard before insert on public.pv_topups for each row execute function private.member_participant_guard();
create trigger purchase_member_guard before insert on public.purchases for each row execute function private.member_participant_guard();
create or replace function private.award(p_member uuid,p_key text,p_kind text,p_gross bigint) returns void
language plpgsql security definer set search_path='' as $$
declare m public.members; actual bigint;
begin
  select * into m from public.members where id=p_member for update;
  if not found or m.role<>'member' or exists(select 1 from public.bonuses where member_id=p_member and event_key=p_key) then return; end if;
  actual := case when m.status='active' then least(p_gross,greatest(0,m.bonus_limit-m.bonus_paid)) else 0 end;
  insert into public.bonuses(member_id,event_key,kind,gross,paid,expired,reason)
  values(p_member,p_key,p_kind,p_gross,actual,p_gross-actual,
    case when actual=p_gross then '' when m.status='suspended' then '회원 정지' else '지급 한도 초과' end);
  update public.members set bonus_paid=bonus_paid+actual where id=p_member;
end $$;

create or replace function private.close_day(p_day date) returns void language plpgsql security definer set search_path='' as $$
declare pool bigint; recipient record; n bigint; i bigint; v_kind text;
begin
  perform pg_advisory_xact_lock(870031);
  if p_day >= (now() at time zone 'Asia/Seoul')::date then raise exception '마감된 날짜만 정산할 수 있습니다.'; end if;
  insert into private.daily_closes(day) values(p_day) on conflict do nothing;
  if not found then return; end if;
  for v_kind in select unnest(array['team','head']) loop
    select coalesce(sum(pv),0)/(case when v_kind='team' then 5 else 10 end) into pool from public.purchases
      where payment_method='pv' and kind='repeat' and (created_at at time zone 'Asia/Seoul')::date=p_day;
    -- Resolve eligible ranks at close time. Store results in ledger; never recompute payouts.
    n:=0;
    for recipient in
      with team as (select m.id from public.members m where m.role='member' and m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r where r.role='member' and r.referrer_id=m.id and r.bonus_limit>0 and r.status='active')>=5),
      head as (select m.id from public.members m where m.role='member' and m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r join team t on t.id=r.id where r.role='member' and r.referrer_id=m.id)>=3)
      select id from team where v_kind='team' union select id from head
    loop n:=n+1; end loop;
    if n=0 or pool=0 then continue; end if;
    i:=0;
    for recipient in
      with team as (select m.id from public.members m where m.role='member' and m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r where r.role='member' and r.referrer_id=m.id and r.bonus_limit>0 and r.status='active')>=5),
      head as (select m.id from public.members m where m.role='member' and m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r join team t on t.id=r.id where r.role='member' and r.referrer_id=m.id)>=3)
      select id from team where v_kind='team' union select id from head order by id
    loop
      i:=i+1;
      perform private.award(recipient.id,'daily:'||p_day||':'||v_kind,v_kind,pool/n+case when i<=pool%n then 1 else 0 end);
    end loop;
  end loop;
  insert into public.audits(action,actor,detail) values('일일 정산',coalesce(auth.uid()::text,'scheduler'),p_day::text);
end $$;

create or replace function private.publish_announcement(p_id uuid,p_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare a public.announcements;n integer;
begin
 perform private.require_admin();
 select * into a from public.announcements where id=p_id for update;
 if not found then raise exception '공지를 찾을 수 없습니다.';end if;
 if a.status='published' then return (select count(*)::integer from public.announcement_recipients where announcement_id=p_id);end if;
 if p_revision is null or a.revision<>p_revision then raise exception '다른 관리자가 공지를 수정했습니다. 다시 확인하세요.';end if;
 if a.target_mode='selected' and exists(select 1 from unnest(a.target_ids) t(id) where not exists(select 1 from public.members m where m.id=t.id and m.status='active' and m.role='member')) then raise exception '수신 대상에 정지 또는 삭제된 회원이 있습니다. 대상을 다시 확인하세요.';end if;
 insert into public.announcement_recipients(announcement_id,member_id) select p_id,id from public.members where status='active' and role='member' and (a.target_mode='all' or id=any(a.target_ids));
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
