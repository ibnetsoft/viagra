-- New purchases only. Snapshot attribution; do not rewrite historical payments.
create table private.center_sales (
 purchase_id uuid primary key references public.purchases(id),
 center_id uuid not null references public.centers(id), center_name text not null,
 owner_id uuid not null references public.members(id), referrer_id uuid references public.members(id),
 pv bigint not null check(pv>0), day date not null
);
create index center_sales_day_idx on private.center_sales(day);
alter table private.center_sales enable row level security;
revoke all on private.center_sales from public,anon,authenticated;
create table public.center_referral_unpaid (
 id uuid primary key default gen_random_uuid(),
 day date not null, center_id uuid not null references public.centers(id), center_name text not null,
 owner_id uuid not null references public.members(id), sales_pv bigint not null check(sales_pv>0),
 amount bigint not null check(amount>=0), reason text not null default '센터장 추천인 없음',
 created_at timestamptz not null default now(), unique(day,center_id,owner_id)
);
alter table public.center_referral_unpaid enable row level security;
revoke all on public.center_referral_unpaid from public,anon,authenticated;
grant select on public.center_referral_unpaid to authenticated;
create policy center_referral_unpaid_admin on public.center_referral_unpaid for select to authenticated using ((select private.is_admin()));
create index center_referral_unpaid_owner_idx on public.center_referral_unpaid(owner_id);
create index center_referral_unpaid_center_idx on public.center_referral_unpaid(center_id);

create function private.settle_centers(p_day date) returns void
language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select center_id,owner_id,sum(pv)::bigint pv from private.center_sales where day=p_day group by center_id,owner_id loop
  perform private.award(s.owner_id,'center:'||p_day||':'||s.center_id,'center',s.pv*3/100);
 end loop;
 for s in select center_id,owner_id,referrer_id,max(center_name) center_name,sum(pv)::bigint pv from private.center_sales where day=p_day group by center_id,owner_id,referrer_id loop
  if s.referrer_id is null then
   insert into public.center_referral_unpaid(day,center_id,center_name,owner_id,sales_pv,amount)
   values(p_day,s.center_id,s.center_name,s.owner_id,s.pv,s.pv*2/100) on conflict do nothing;
  else
   perform private.award(s.referrer_id,'center-referral:'||p_day||':'||s.center_id||':'||s.owner_id,'center_referral',s.pv*2/100);
  end if;
 end loop;
end $$;
revoke all on function private.settle_centers(date) from public,anon,authenticated;

create or replace function private.award(p_member uuid,p_key text,p_kind text,p_gross bigint) returns void
language plpgsql security definer set search_path='' as $$
declare m public.members; actual bigint;
begin
  select * into m from public.members where id=p_member for update;
  if not found or m.role<>'member' or exists(select 1 from public.bonuses where member_id=p_member and event_key=p_key) then return; end if;
  actual := case when m.status='active' then case when p_kind in ('center','center_referral') then p_gross else least(p_gross,greatest(0,m.bonus_limit-m.bonus_paid)) end else 0 end;
  insert into public.bonuses(member_id,event_key,kind,gross,paid,expired,reason)
  values(p_member,p_key,p_kind,p_gross,actual,p_gross-actual,
    case when actual=p_gross then '' when m.status='suspended' then '회원 정지' else '지급 한도 초과' end);
  if p_kind not in ('center','center_referral') then update public.members set bonus_paid=bonus_paid+actual where id=p_member; end if;
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
  perform private.settle_centers(p_day);
  insert into public.audits(action,actor,detail) values('일일 정산',coalesce(auth.uid()::text,'scheduler'),p_day::text);
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
  else
    parent:=m.sponsor_id;
    for i in 1..13 loop
      exit when parent is null;
      perform private.award(parent,p_request||':rollup','rollup',10000);
      select sponsor_id into parent from public.members where id=parent;
    end loop;
  end if;
  perform private.record_triangle_purchase(p_request);
  perform private.check_triangles();
  insert into private.center_sales(purchase_id,center_id,center_name,owner_id,referrer_id,pv,day)
  select p_request,c.id,c.name,c.owner_id,r.id,points,(now() at time zone 'Asia/Seoul')::date
  from public.centers c join public.members o on o.id=c.owner_id and o.role='member'
  left join public.members r on r.id=o.referrer_id and r.role='member'
  where c.id=m.center_id;
  insert into public.audits(action,actor,detail) values('PV 상품 구매',auth.uid()::text,m.member_code||' · '||product.name||' · '||points||' PV · 주문 '||p_request);
  return p_request;
end $$;



create or replace function private.close_due(p_through date) returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform pg_advisory_xact_lock(870031);
  if p_through >= (now() at time zone 'Asia/Seoul')::date then raise exception '마감된 날짜만 정산할 수 있습니다.'; end if;
  for item in select distinct (p.created_at at time zone 'Asia/Seoul')::date as day
    from public.purchases p where p.payment_method='pv' and (p.created_at at time zone 'Asia/Seoul')::date<=p_through
    and not exists(select 1 from private.daily_closes c where c.day=(p.created_at at time zone 'Asia/Seoul')::date)
    order by day
  loop perform private.close_day(item.day); end loop;
end $$;
-- Keep the home total accurate without downloading the complete ledger.
create function public.my_bonus_total() returns bigint language sql stable security invoker set search_path='' as $$
 select coalesce(sum(paid),0)::bigint from public.bonuses where member_id=(select auth.uid());
$$;
revoke all on function public.my_bonus_total() from public,anon;
grant execute on function public.my_bonus_total() to authenticated;
