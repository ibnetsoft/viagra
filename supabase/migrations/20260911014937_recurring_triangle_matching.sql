-- Purchase-time placement is immutable for waiting matching credits.
-- A purchase contributes once to its own triangle and once to its sponsor's triangle.
create table private.triangle_matches (
 id uuid primary key default gen_random_uuid(), root_id uuid not null references public.members(id),
 migrated boolean not null default false, created_at timestamptz not null default now()
);
create table private.triangle_credits (
 root_id uuid not null references public.members(id), purchase_id uuid not null references public.purchases(id),
 slot text not null check(slot in ('self','L','R')), match_id uuid references private.triangle_matches(id),
 created_at timestamptz not null,
 primary key(root_id,purchase_id)
);
create index triangle_waiting_idx on private.triangle_credits(root_id,slot,created_at,purchase_id) where match_id is null;
alter table private.triangle_matches enable row level security;
alter table private.triangle_credits enable row level security;
revoke all on private.triangle_matches,private.triangle_credits from public,anon,authenticated;

create function private.record_triangle_purchase(p_purchase uuid) returns void
language sql security definer set search_path='' as $$
 insert into private.triangle_credits(root_id,purchase_id,slot,created_at)
 select m.id,p.id,'self',p.created_at from public.purchases p join public.members m on m.id=p.member_id
 where p.id=p_purchase and p.payment_method='pv' and m.role='member'
 union all
 select m.sponsor_id,p.id,m.position,p.created_at from public.purchases p join public.members m on m.id=p.member_id
 join public.members parent on parent.id=m.sponsor_id and parent.role='member'
 where p.id=p_purchase and p.payment_method='pv' and m.role='member' and m.position in ('L','R')
 on conflict do nothing;
$$;
revoke all on function private.record_triangle_purchase(uuid) from public,anon,authenticated;

create function private.match_triangles(p_pay boolean) returns void
language plpgsql security definer set search_path='' as $$
declare root record; own_order uuid; left_order uuid; right_order uuid; match uuid; beneficiary uuid; depth integer;
begin
 perform pg_advisory_xact_lock(870031);
 for root in select c.root_id from private.triangle_credits c join public.members m on m.id=c.root_id and m.role='member'
   where c.match_id is null group by c.root_id having count(distinct c.slot)=3 order by c.root_id
 loop
  loop
   select purchase_id into own_order from private.triangle_credits where root_id=root.root_id and slot='self' and match_id is null order by created_at,purchase_id limit 1;
   select purchase_id into left_order from private.triangle_credits where root_id=root.root_id and slot='L' and match_id is null order by created_at,purchase_id limit 1;
   select purchase_id into right_order from private.triangle_credits where root_id=root.root_id and slot='R' and match_id is null order by created_at,purchase_id limit 1;
   exit when own_order is null or left_order is null or right_order is null;
   insert into private.triangle_matches(root_id,migrated) values(root.root_id,not p_pay) returning id into match;
   update private.triangle_credits set match_id=match where root_id=root.root_id and purchase_id in(own_order,left_order,right_order);
   if p_pay then
    beneficiary:=root.root_id;
    for depth in 1..3 loop
     exit when beneficiary is null;
     if exists(select 1 from public.members where id=beneficiary and role='member' and bonus_limit>0) then
      perform private.award(beneficiary,'triangle'||depth||':match:'||match,'triangle'||depth,case when depth=3 then 60000 else 90000 end);
     end if;
     select sponsor_id into beneficiary from public.members where id=beneficiary and role='member';
    end loop;
   end if;
  end loop;
 end loop;
end $$;
revoke all on function private.match_triangles(boolean) from public,anon,authenticated;
create or replace function private.check_triangles() returns void language sql security definer set search_path='' as $$
 select private.match_triangles(true);
$$;
revoke all on function private.check_triangles() from public,anon,authenticated;

-- Establish a cutover without replaying historical rewards. Keep unmatched purchases.
do $$ declare p record; begin
 perform pg_advisory_xact_lock(870031);
 for p in select id from public.purchases where payment_method='pv' order by created_at,id loop
  perform private.record_triangle_purchase(p.id);
 end loop;
 perform private.match_triangles(false);
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
  select owner_id into owner from public.centers where id=m.center_id;
  if owner is not null then perform private.award(owner,p_request||':center','center',points/20); end if;
  insert into public.audits(action,actor,detail) values('PV 상품 구매',auth.uid()::text,m.member_code||' · '||product.name||' · '||points||' PV · 주문 '||p_request);
  return p_request;
end $$;


