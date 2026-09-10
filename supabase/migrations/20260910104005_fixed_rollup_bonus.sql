-- Fixed 10,000 won per sponsor generation for every repeat purchase.
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
      perform private.award(parent,p_request||':rollup','rollup',10000);
      select sponsor_id into parent from public.members where id=parent;
    end loop;
  end if;
  select owner_id into owner from public.centers where id=m.center_id;
  if owner is not null then perform private.award(owner,p_request||':center','center',points/20); end if;
  insert into public.audits(action,actor,detail) values('PV 상품 구매',auth.uid()::text,m.member_code||' · '||product.name||' · '||points||' PV · 주문 '||p_request);
  return p_request;
end $$;

