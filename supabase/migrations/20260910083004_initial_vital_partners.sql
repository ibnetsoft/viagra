-- All financial writes are atomic, serialized, and available only through checked RPCs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.members (
  id uuid primary key references auth.users(id),
  member_code text not null unique default ('VP' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  name text not null check (length(trim(name)) between 1 and 80),
  email text not null, phone text not null check (phone ~ '^[0-9+ -]{9,20}$'), postcode text not null check (postcode ~ '^[0-9]{5}$'),
  address text not null check (length(trim(address)) > 0), address_detail text not null default '',
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  referrer_id uuid references public.members(id), sponsor_id uuid references public.members(id),
  position text check (position in ('L','R')), center_id uuid,
  pv bigint not null default 0 check (pv >= 0), bonus_limit bigint not null default 0 check (bonus_limit >= 0),
  bonus_paid bigint not null default 0 check (bonus_paid >= 0 and bonus_paid <= bonus_limit),
  created_at timestamptz not null default now(),
  check (referrer_id is distinct from id and sponsor_id is distinct from id),
  check ((sponsor_id is null and position is null) or (sponsor_id is not null and position is not null)),
  unique (sponsor_id, position)
);
create index members_referrer_idx on public.members(referrer_id);
create index members_center_idx on public.members(center_id);
create table public.centers (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  owner_id uuid not null references public.members(id)
);
alter table public.members add constraint members_center_fk foreign key (center_id) references public.centers(id);
create table public.purchases (
  id uuid primary key, member_id uuid not null references public.members(id),
  kind text not null check (kind in ('initial','repeat')),
  cash bigint not null, pv bigint not null, cap_added bigint not null,
  shipping_status text not null default 'pending' check (shipping_status in ('pending','delivered')),
  recipient text not null, phone text not null, address text not null,
  tracking text not null default '', note text not null,
  created_by uuid not null references public.members(id), created_at timestamptz not null default now(),
  delivered_at timestamptz,
  check ((kind='initial' and cash=370000 and pv=300000 and cap_added=1500000)
    or (kind='repeat' and cash=270000 and pv=200000 and cap_added=1500000))
);
create unique index purchases_initial_once on public.purchases(member_id) where kind='initial';
create index purchases_member_idx on public.purchases(member_id, created_at desc);
create table public.bonuses (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
  event_key text not null, kind text not null,
  gross bigint not null check (gross >= 0), paid bigint not null check (paid >= 0),
  expired bigint not null check (expired >= 0), reason text not null default '',
  created_at timestamptz not null default now(), unique(member_id, event_key), check (gross=paid+expired)
);
create index bonuses_member_idx on public.bonuses(member_id,created_at desc);
create table public.audits (
  id uuid primary key default gen_random_uuid(), action text not null, actor text not null,
  detail text not null, created_at timestamptz not null default now()
);
create table private.daily_closes (day date primary key, created_at timestamptz not null default now());
alter table private.daily_closes enable row level security;

create function private.is_admin() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.members where id=(select auth.uid()) and role='admin' and status='active') $$;
create function private.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
end $$;
alter table public.members enable row level security;
alter table public.centers enable row level security;
alter table public.purchases enable row level security;
alter table public.bonuses enable row level security;
alter table public.audits enable row level security;
create policy members_read on public.members for select to authenticated using (id=(select auth.uid()) or (select private.is_admin()));
create policy centers_read on public.centers for select to authenticated using ((select private.is_admin()) or owner_id=(select auth.uid()) or id in (select center_id from public.members where id=(select auth.uid())));
create policy purchases_read on public.purchases for select to authenticated using (member_id=(select auth.uid()) or (select private.is_admin()));
create policy bonuses_read on public.bonuses for select to authenticated using (member_id=(select auth.uid()) or (select private.is_admin()));
create policy audits_read on public.audits for select to authenticated using ((select private.is_admin()));
revoke all on public.members,public.centers,public.purchases,public.bonuses,public.audits from anon,authenticated;
grant select on public.members,public.centers,public.purchases,public.bonuses,public.audits to authenticated;

create function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.members(id,name,email,phone,postcode,address,address_detail)
  values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'postcode',trim(new.raw_user_meta_data->>'address'),coalesce(new.raw_user_meta_data->>'address_detail',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.on_signup();

-- Internal ledger writer. Never granted to any API role.
create function private.award(p_member uuid,p_key text,p_kind text,p_gross bigint) returns void
language plpgsql security definer set search_path='' as $$
declare m public.members; actual bigint;
begin
  select * into m from public.members where id=p_member for update;
  if not found or exists(select 1 from public.bonuses where member_id=p_member and event_key=p_key) then return; end if;
  actual := case when m.status='active' then least(p_gross,greatest(0,m.bonus_limit-m.bonus_paid)) else 0 end;
  insert into public.bonuses(member_id,event_key,kind,gross,paid,expired,reason)
  values(p_member,p_key,p_kind,p_gross,actual,p_gross-actual,
    case when actual=p_gross then '' when m.status='suspended' then '회원 정지' else '지급 한도 초과' end);
  update public.members set bonus_paid=bonus_paid+actual where id=p_member;
end $$;

create function private.check_triangles() returns void language plpgsql security definer set search_path='' as $$
declare root record; beneficiary uuid; depth integer;
begin
  for root in select m.id,m.sponsor_id from public.members m
    where m.bonus_limit>0 and (select count(*) from public.members c where c.sponsor_id=m.id and c.bonus_limit>0)=2
    order by m.created_at,m.id
  loop
    beneficiary:=root.id;
    for depth in 1..3 loop
      exit when beneficiary is null;
      if exists(select 1 from public.members where id=beneficiary and bonus_limit>0) then
        perform private.award(beneficiary,'triangle'||depth||':'||root.id,'triangle'||depth,case when depth=3 then 60000 else 90000 end);
      end if;
      select sponsor_id into beneficiary from public.members where id=beneficiary;
    end loop;
  end loop;
end $$;

create function private.credit_purchase(p_member uuid,p_request uuid,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.members; k text; amount bigint; points bigint; parent uuid; i integer; owner uuid; existing uuid;
begin
  perform pg_advisory_xact_lock(870031);
  perform private.require_admin();
  perform private.close_due((now() at time zone 'Asia/Seoul')::date-1);
  select member_id into existing from public.purchases where id=p_request;
  if found then
    if existing<>p_member then raise exception '다른 회원에게 사용된 요청 번호입니다.'; end if;
    return p_request;
  end if;
  if p_request is null or length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception '입금 확인 메모를 입력하세요.'; end if;
  select * into m from public.members where id=p_member for update;
  if not found or m.status<>'active' then raise exception '충전할 수 없는 회원입니다.'; end if;
  k:=case when exists(select 1 from public.purchases where member_id=p_member) then 'repeat' else 'initial' end;
  amount:=case when k='initial' then 370000 else 270000 end;
  points:=case when k='initial' then 300000 else 200000 end;
  insert into public.purchases(id,member_id,kind,cash,pv,cap_added,recipient,phone,address,note,created_by)
  values(p_request,p_member,k,amount,points,1500000,m.name,m.phone,'('||m.postcode||') '||m.address||' '||m.address_detail,trim(p_note),auth.uid());
  update public.members set pv=pv+points,bonus_limit=bonus_limit+1500000 where id=p_member;
  if k='initial' then
    parent:=m.referrer_id;
    for i in 1..2 loop
      exit when parent is null;
      perform private.award(parent,p_request||':referral','referral',case when i=1 then 90000 else 30000 end);
      select referrer_id into parent from public.members where id=parent;
    end loop;
    perform private.check_triangles();
  else
    parent:=m.sponsor_id;
    for i in 1..13 loop
      exit when parent is null;
      perform private.award(parent,p_request||':rollup','rollup',10000);
      select sponsor_id into parent from public.members where id=parent;
    end loop;
  end if;
  select owner_id into owner from public.centers where id=m.center_id;
  if owner is not null then perform private.award(owner,p_request||':center','center',points/20); end if;
  insert into public.audits(action,actor,detail) values('수동 충전',auth.uid()::text,m.member_code||' · '||amount||'원 · '||trim(p_note));
  return p_request;
end $$;
create function public.credit_purchase(p_member uuid,p_request uuid,p_note text) returns uuid language sql security invoker set search_path='' as $$ select private.credit_purchase(p_member,p_request,p_note) $$;

create function private.update_member(p_member uuid,p_name text,p_phone text,p_postcode text,p_address text,p_detail text,p_status text,p_referrer uuid,p_sponsor uuid,p_position text,p_center uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.members; cycle_found boolean;
begin
  perform pg_advisory_xact_lock(870031); perform private.require_admin();
  perform private.close_due((now() at time zone 'Asia/Seoul')::date-1);
  select * into m from public.members where id=p_member for update;
  if not found then raise exception '회원을 찾을 수 없습니다.'; end if;
  if p_member=auth.uid() and p_status<>'active' then raise exception '자신의 계정을 정지할 수 없습니다.'; end if;
  if (exists(select 1 from public.purchases where member_id=p_member) or
      exists(select 1 from public.members where referrer_id=p_member or sponsor_id=p_member)) and
    (m.referrer_id is distinct from p_referrer or m.sponsor_id is distinct from p_sponsor or m.position is distinct from p_position)
    then raise exception '첫 충전 후 또는 하위 회원 연결 후 추천·후원 관계는 변경할 수 없습니다.'; end if;
  with recursive ancestors as (
    select id,referrer_id from public.members where id=p_referrer
    union select x.id,x.referrer_id from public.members x join ancestors a on x.id=a.referrer_id
  ) select exists(select 1 from ancestors where id=p_member) into cycle_found;
  if cycle_found then raise exception '추천 관계가 순환합니다.'; end if;
  with recursive ancestors as (
    select id,sponsor_id from public.members where id=p_sponsor
    union select x.id,x.sponsor_id from public.members x join ancestors a on x.id=a.sponsor_id
  ) select exists(select 1 from ancestors where id=p_member) into cycle_found;
  if cycle_found then raise exception '후원 관계가 순환합니다.'; end if;
  update public.members set name=trim(p_name),phone=p_phone,postcode=p_postcode,address=trim(p_address),address_detail=p_detail,
    status=p_status,referrer_id=p_referrer,sponsor_id=p_sponsor,position=p_position,center_id=p_center where id=p_member;
  insert into public.audits(action,actor,detail) values('회원 수정',auth.uid()::text,m.member_code||' · 상태 '||p_status);
end $$;
create function public.update_member(p_member uuid,p_name text,p_phone text,p_postcode text,p_address text,p_detail text,p_status text,p_referrer uuid,p_sponsor uuid,p_position text,p_center uuid)
returns void language sql security invoker set search_path='' as $$ select private.update_member(p_member,p_name,p_phone,p_postcode,p_address,p_detail,p_status,p_referrer,p_sponsor,p_position,p_center) $$;

create function private.update_shipping(p_purchase uuid,p_status text,p_tracking text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  if p_status not in ('pending','delivered') or length(p_tracking)>100 then raise exception '배송 정보를 확인하세요.'; end if;
  update public.purchases set shipping_status=p_status,tracking=p_tracking,delivered_at=case when p_status='delivered' then now() else null end where id=p_purchase;
  if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
  insert into public.audits(action,actor,detail) values('배송 수정',auth.uid()::text,p_purchase||' · '||case when p_status='delivered' then '배송완료' else '미배송' end);
end $$;
create function public.update_shipping(p_purchase uuid,p_status text,p_tracking text) returns void language sql security invoker set search_path='' as $$ select private.update_shipping(p_purchase,p_status,p_tracking) $$;

create function private.create_center(p_name text,p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  if length(trim(p_name)) not between 1 and 80 then raise exception '센터명을 확인하세요.'; end if;
  insert into public.centers(name,owner_id) values(trim(p_name),p_owner);
  insert into public.audits(action,actor,detail) values('센터 생성',auth.uid()::text,trim(p_name));
end $$;
create function public.create_center(p_name text,p_owner uuid) returns void language sql security invoker set search_path='' as $$ select private.create_center(p_name,p_owner) $$;

-- Previous-day rank pools; equal integer shares, deterministic remainder allocation.
create function private.close_day(p_day date) returns void language plpgsql security definer set search_path='' as $$
declare pool bigint; recipient record; n bigint; i bigint; v_kind text;
begin
  perform pg_advisory_xact_lock(870031);
  if p_day >= (now() at time zone 'Asia/Seoul')::date then raise exception '마감된 날짜만 정산할 수 있습니다.'; end if;
  insert into private.daily_closes(day) values(p_day) on conflict do nothing;
  if not found then return; end if;
  for v_kind in select unnest(array['team','head']) loop
    select coalesce(sum(pv),0)/(case when v_kind='team' then 5 else 10 end) into pool from public.purchases
      where kind='repeat' and (created_at at time zone 'Asia/Seoul')::date=p_day;
    -- Resolve eligible ranks at close time. Store results in ledger; never recompute payouts.
    n:=0;
    for recipient in
      with team as (select m.id from public.members m where m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r where r.referrer_id=m.id and r.bonus_limit>0 and r.status='active')>=5),
      head as (select m.id from public.members m where m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r join team t on t.id=r.id where r.referrer_id=m.id)>=3)
      select id from team where v_kind='team' union select id from head
    loop n:=n+1; end loop;
    if n=0 or pool=0 then continue; end if;
    i:=0;
    for recipient in
      with team as (select m.id from public.members m where m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r where r.referrer_id=m.id and r.bonus_limit>0 and r.status='active')>=5),
      head as (select m.id from public.members m where m.status='active' and m.bonus_limit>0 and
        (select count(*) from public.members r join team t on t.id=r.id where r.referrer_id=m.id)>=3)
      select id from team where v_kind='team' union select id from head order by id
    loop
      i:=i+1;
      perform private.award(recipient.id,'daily:'||p_day||':'||v_kind,v_kind,pool/n+case when i<=pool%n then 1 else 0 end);
    end loop;
  end loop;
  insert into public.audits(action,actor,detail) values('일일 정산',coalesce(auth.uid()::text,'scheduler'),p_day::text);
end $$;
-- Close overdue dates BEFORE any new purchase or membership change. A late scheduler
-- must not let a repurchase revive a bonus from a previously exhausted day.
create function private.close_due(p_through date) returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform pg_advisory_xact_lock(870031);
  if p_through >= (now() at time zone 'Asia/Seoul')::date then raise exception '마감된 날짜만 정산할 수 있습니다.'; end if;
  for item in select distinct (p.created_at at time zone 'Asia/Seoul')::date as day
    from public.purchases p where p.kind='repeat' and (p.created_at at time zone 'Asia/Seoul')::date<=p_through
    and not exists(select 1 from private.daily_closes c where c.day=(p.created_at at time zone 'Asia/Seoul')::date)
    order by day
  loop perform private.close_day(item.day); end loop;
end $$;
create function private.admin_close_day(p_day date) returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_admin(); perform private.close_due(p_day); end $$;
create function public.close_day(p_day date) returns void language sql security invoker set search_path='' as $$ select private.admin_close_day(p_day) $$;

-- Return only the caller's grade; do not expose downline names, addresses, or totals.
create function private.my_grade() returns text language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if exists(select 1 from public.centers where owner_id=me) then return '센터'; end if;
  if (select count(*) from public.members m where m.referrer_id=me and m.bonus_limit>0 and m.status='active'
      and (select count(*) from public.members c where c.referrer_id=m.id and c.bonus_limit>0 and c.status='active')>=5)>=3
    then return '본부장'; end if;
  if (select count(*) from public.members where referrer_id=me and bonus_limit>0 and status='active')>=5 then return '팀장'; end if;
  return '에이전트';
end $$;
create function public.my_grade() returns text language sql stable security invoker set search_path='' as $$ select private.my_grade() $$;

-- Explicitly remove default PUBLIC execute privileges, especially on internal helpers.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.my_grade() to authenticated;
revoke all on function public.my_grade() from public,anon;
grant execute on function public.my_grade() to authenticated;
grant execute on function private.credit_purchase(uuid,uuid,text), private.update_member(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid),
  private.update_shipping(uuid,text,text),private.create_center(text,uuid),private.admin_close_day(date) to authenticated;
revoke all on function public.credit_purchase(uuid,uuid,text),public.update_member(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid),
  public.update_shipping(uuid,text,text),public.create_center(text,uuid),public.close_day(date) from public,anon;
grant execute on function public.credit_purchase(uuid,uuid,text),public.update_member(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid),
  public.update_shipping(uuid,text,text),public.create_center(text,uuid),public.close_day(date) to authenticated;
