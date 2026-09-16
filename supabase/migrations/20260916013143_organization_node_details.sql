create or replace function private.my_organization(p_mode text,p_root uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); root_id uuid:=coalesce(p_root,auth.uid()); allowed boolean; root_node jsonb; children jsonb; total integer;
begin
 if me is null or not exists(select 1 from public.members where role='member' and id=me and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_mode not in ('referral','sponsor') or p_mode is null or p_offset is null or p_offset<0 then raise exception '조직도 조회 조건을 확인하세요.'; end if;
 with recursive ancestors as (
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end as parent from public.members m where m.role='member' and id=root_id
 union
 select m.id,case when p_mode='referral' then m.referrer_id else m.sponsor_id end from public.members m join ancestors a on m.id=a.parent where m.role='member'
 ) select exists(select 1 from ancestors where id=me) into allowed;
 if not allowed then raise exception '본인 산하만 조회할 수 있습니다.' using errcode='42501'; end if;
 select jsonb_build_object(
   'id',m.id,
   'name',m.name,
   'member_code',m.member_code,
   'phone',m.phone,
   'created_at',m.created_at,
   'sales_pv',coalesce((select sum(p.pv) from public.purchases p where p.member_id=m.id and p.payment_method='pv'),0),
   'position',case when p_mode='sponsor' then m.position else null end
 ) into root_node
 from public.members m
 where m.role='member' and m.id=root_id;
 select count(*) into total from public.members where role='member' and case when p_mode='referral' then referrer_id else sponsor_id end=root_id;
 select coalesce(jsonb_agg(n.node order by n.member_code,n.id),'[]'::jsonb) into children from (
 select m.id,m.member_code,jsonb_build_object(
   'id',m.id,
   'name',m.name,
   'member_code',m.member_code,
   'phone',m.phone,
   'created_at',m.created_at,
   'sales_pv',coalesce((select sum(p.pv) from public.purchases p where p.member_id=m.id and p.payment_method='pv'),0),
   'position',case when p_mode='sponsor' then m.position else null end,
   'has_children',exists(select 1 from public.members c where c.role='member' and case when p_mode='referral' then c.referrer_id else c.sponsor_id end=m.id)
 ) node
 from public.members m where m.role='member' and case when p_mode='referral' then m.referrer_id else m.sponsor_id end=root_id
 order by m.member_code,m.id limit 50 offset p_offset) n;
 return jsonb_build_object('root',root_node,'children',children,'total',total);
end $$;
