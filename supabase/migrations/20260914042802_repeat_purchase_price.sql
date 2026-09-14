-- Explicit prices per product. Preserve historical orders and reward ledgers.
alter table public.products add column repeat_pv_price bigint;
update public.products set repeat_pv_price=case when id='caa14000-0000-4000-8000-000000000001' then 200000 else pv_price end;
alter table public.products alter column repeat_pv_price set not null;
alter table public.products add constraint products_repeat_price_positive check(repeat_pv_price>0);
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
  amount:=0; points:=case when k='repeat' then product.repeat_pv_price else product.pv_price end;
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



