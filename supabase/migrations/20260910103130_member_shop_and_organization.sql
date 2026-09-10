-- Product prices are authoritative on the server; orders retain their price snapshot.
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null,
 description text not null default '', pv_price bigint not null check(pv_price>0),
 active boolean not null default true
);
alter table public.products enable row level security;
revoke all on public.products from public,anon,authenticated;
grant select on public.products to authenticated;
create policy products_read on public.products for select to authenticated using(active or (select private.is_admin()));
insert into public.products(id,name,description,pv_price) values('caa14000-0000-4000-8000-000000000001','활력단 15개','활력단 15개 구성 · 등록된 배송지로 배송됩니다.',300000);
alter table public.purchases add column payment_method text not null default 'cash' check(payment_method in ('cash','pv')),
 add column product_id uuid references public.products(id),
 add column product_name text not null default '활력단 15개',
 add column pv_spent bigint not null default 0 check(pv_spent>=0);
alter table public.purchases drop constraint purchases_check;
alter table public.purchases add constraint purchases_payment_check check(
 (payment_method='cash' and pv_spent=0 and ((kind='initial' and cash=370000 and pv=300000 and cap_added=1500000)
 or (kind='repeat' and cash=270000 and pv=200000 and cap_added=1500000)))
 or (payment_method='pv' and cash=0 and pv_spent>0 and product_id is not null and pv>0 and cap_added=1500000));

-- Only caller-owned roots and descendants are accessible; no email/address/balances returned.
create function private.my_organization(p_mode text,p_root uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); root_id uuid:=coalesce(p_root,auth.uid()); allowed boolean; root_node jsonb; children jsonb; total integer;
begin
 if me is null or not exists(select 1 from public.members where id=me and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_mode not in ('referral','sponsor') or p_mode is null or p_offset is null or p_offset<0 then raise exception '조직도 조회 조건을 확인하세요.'; end if;
 with recursive ancestors as (
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end as parent from public.members m where m.id=root_id
 union
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end from public.members m join ancestors a on m.id=a.parent
 ) select exists(select 1 from ancestors where id=me) into allowed;
 if not allowed then raise exception '본인 산하만 조회할 수 있습니다.' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'name',name,'member_code',member_code,'position',case when p_mode='sponsor' then position else null end) into root_node from public.members where id=root_id;
 select count(*) into total from public.members where case when p_mode='referral' then referrer_id else sponsor_id end=root_id;
 select coalesce(jsonb_agg(n.node order by n.member_code,n.id),'[]'::jsonb) into children from (
 select m.id,m.member_code,jsonb_build_object('id',m.id,'name',m.name,'member_code',m.member_code,'position',case when p_mode='sponsor' then m.position else null end,
 'has_children',exists(select 1 from public.members c where case when p_mode='referral' then c.referrer_id else c.sponsor_id end=m.id)) node
 from public.members m where case when p_mode='referral' then m.referrer_id else m.sponsor_id end=root_id
 order by m.member_code,m.id limit 50 offset p_offset) n;
 return jsonb_build_object('root',root_node,'children',children,'total',total);
end $$;
create function public.my_organization(p_mode text,p_root uuid default null,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.my_organization(p_mode,p_root,p_offset) $$;
revoke all on function private.my_organization(text,uuid,integer),public.my_organization(text,uuid,integer) from public,anon,authenticated;
grant execute on function private.my_organization(text,uuid,integer),public.my_organization(text,uuid,integer) to authenticated;

create function private.buy_product(p_product uuid,p_request uuid) returns uuid
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
  select * into product from public.products where id=p_product and active for share;
  if not found then raise exception '구매할 수 없는 상품입니다.'; end if;
  select * into m from public.members where id=p_member for update;
  if not found or m.status<>'active' then raise exception '충전할 수 없는 회원입니다.'; end if;
  k:=case when exists(select 1 from public.purchases where member_id=p_member) then 'repeat' else 'initial' end;
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
      perform private.award(parent,p_request||':rollup','rollup',points/20);
      select sponsor_id into parent from public.members where id=parent;
    end loop;
  end if;
  select owner_id into owner from public.centers where id=m.center_id;
  if owner is not null then perform private.award(owner,p_request||':center','center',points/20); end if;
  insert into public.audits(action,actor,detail) values('PV 상품 구매',auth.uid()::text,m.member_code||' · '||product.name||' · '||points||' PV · 주문 '||p_request);
  return p_request;
end $$;

create function public.buy_product(p_product uuid,p_request uuid) returns uuid language sql security invoker set search_path='' as $$ select private.buy_product(p_product,p_request) $$;
revoke all on function private.buy_product(uuid,uuid),public.buy_product(uuid,uuid) from public,anon,authenticated;
grant execute on function private.buy_product(uuid,uuid),public.buy_product(uuid,uuid) to authenticated;

create or replace function private.credit_purchase(p_member uuid,p_request uuid,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.members; k text; amount bigint; points bigint; parent uuid; i integer; owner uuid; existing uuid;
begin
  perform pg_advisory_xact_lock(870031);
  perform private.require_admin();
  perform private.close_due((now() at time zone 'Asia/Seoul')::date-1);
  select member_id into existing from public.purchases where id=p_request;
  if found then
    if exists(select 1 from public.purchases where id=p_request and payment_method<>'cash') then raise exception '이미 사용된 요청 번호입니다.'; end if;
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
