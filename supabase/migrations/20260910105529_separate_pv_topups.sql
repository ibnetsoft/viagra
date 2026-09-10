-- Deposits add spendable PV only. Product purchases alone create rewards and shipping.
create table public.pv_topups (
 id uuid primary key, member_id uuid not null references public.members(id),
 kind text not null check(kind in ('initial','repeat')), cash bigint not null,pv bigint not null,
 note text not null,created_by uuid not null references public.members(id),created_at timestamptz not null default now(),
 check((kind='initial' and cash=370000 and pv=300000) or (kind='repeat' and cash=270000 and pv=200000))
);
create index pv_topups_member_idx on public.pv_topups(member_id,created_at);
alter table public.pv_topups enable row level security;
revoke all on public.pv_topups from public,anon,authenticated;
grant select on public.pv_topups to authenticated;
create policy topups_read on public.pv_topups for select to authenticated using(member_id=(select auth.uid()) or (select private.is_admin()));
-- Preserve legacy financial records; do not replay or reverse prior rewards.
insert into public.pv_topups(id,member_id,kind,cash,pv,note,created_by,created_at)
select id,member_id,kind,cash,pv,note,created_by,created_at from public.purchases where payment_method='cash';
drop index public.purchases_initial_once;
create unique index purchases_initial_once on public.purchases(member_id) where kind='initial' and payment_method='pv';
create or replace function private.credit_purchase(p_member uuid,p_request uuid,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.members; existing public.pv_topups; k text; amount bigint; points bigint;
begin
 perform pg_advisory_xact_lock(870031);perform private.require_admin();
 if p_request is null or length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception '입금 확인 메모를 입력하세요.';end if;
 select * into existing from public.pv_topups where id=p_request;
 if found then
  if existing.member_id<>p_member then raise exception '다른 회원에게 사용된 요청 번호입니다.';end if;
  return p_request;
 end if;
 if exists(select 1 from public.purchases where id=p_request) then raise exception '이미 사용된 요청 번호입니다.';end if;
 select * into m from public.members where id=p_member for update;
 if not found or m.status<>'active' then raise exception '충전할 수 없는 회원입니다.';end if;
 k:=case when exists(select 1 from public.pv_topups where member_id=p_member) then 'repeat' else 'initial' end;
 amount:=case when k='initial' then 370000 else 270000 end;
 points:=case when k='initial' then 300000 else 200000 end;
 insert into public.pv_topups(id,member_id,kind,cash,pv,note,created_by) values(p_request,p_member,k,amount,points,trim(p_note),auth.uid());
 update public.members set pv=pv+points where id=p_member;
 insert into public.audits(action,actor,detail) values('PV 충전',auth.uid()::text,m.member_code||' · '||amount||'원 · '||points||' PV · '||trim(p_note));
 return p_request;
end $$;

create or replace function private.buy_product(p_product uuid,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p_member uuid:=auth.uid(); product public.products; old_order public.purchases; m public.members; k text; amount bigint; points bigint; parent uuid; i integer; owner uuid; existing uuid;
begin
  perform pg_advisory_xact_lock(870031);
  if p_member is null or not exists(select 1 from public.members where id=p_member and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  perform private.close_due((now() at time zone 'Asia/Seoul')::date-1);
  if p_request is null or p_product is null then raise exception '상품과 요청 번호를 확인하세요.'; end if;
  select * into old_order from public.purchases where id=p_request;
  if found then
    if old_order.member_id<>p_member or old_order.product_id is distinct from p_product or old_order.payment_method<>'pv' then raise exception '이미 사용된 요청 번호입니다.'; end if;
    return p_request;
  end if;
  if exists(select 1 from public.pv_topups where id=p_request) then raise exception '이미 사용된 요청 번호입니다.';end if;
  select * into product from public.products where id=p_product and active for share;
  if not found then raise exception '구매할 수 없는 상품입니다.'; end if;
  select * into m from public.members where id=p_member for update;
  if not found or m.status<>'active' then raise exception '충전할 수 없는 회원입니다.'; end if;
  k:=case when exists(select 1 from public.purchases where member_id=p_member and payment_method='pv') then 'repeat' else 'initial' end;
  amount:=0; points:=product.pv_price;
  if m.pv<points then raise exception '보유 PV가 부족합니다.'; end if;
  insert into public.purchases(id,member_id,kind,cash,pv,cap_added,recipient,phone,address,note,created_by,payment_method,product_id,product_name,pv_spent)
  values(p_request,p_member,k,amount,points,1500000,m.name,m.phone,'('||m.postcode||') '||m.address||' '||m.address_detail,'PV 상품 구매',auth.uid(),'pv',product.id,product.name,points);
  update public.members set pv=pv-points,bonus_limit=bonus_limit+1500000 where id=p_member;
  if k='initial' then
    parent:=m.referrer_id;
    for i in 1..2 loop
      exit when parent is null;
      perform private.award(parent,p_request||':referral','referral',case when i=1 then points*3/10 else points/10 end);
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
  insert into public.audits(action,actor,detail) values('PV 상품 구매',auth.uid()::text,m.member_code||' · '||product.name||' · '||points||' PV · 주문 '||p_request);
  return p_request;
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
create or replace function private.close_due(p_through date) returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform pg_advisory_xact_lock(870031);
  if p_through >= (now() at time zone 'Asia/Seoul')::date then raise exception '마감된 날짜만 정산할 수 있습니다.'; end if;
  for item in select distinct (p.created_at at time zone 'Asia/Seoul')::date as day
    from public.purchases p where p.payment_method='pv' and p.kind='repeat' and (p.created_at at time zone 'Asia/Seoul')::date<=p_through
    and not exists(select 1 from private.daily_closes c where c.day=(p.created_at at time zone 'Asia/Seoul')::date)
    order by day
  loop perform private.close_day(item.day); end loop;
end $$;
