create or replace function private.my_organization_tree(p_mode text,p_root uuid,p_depth integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  me uuid := auth.uid();
  root_id uuid := coalesce(p_root, auth.uid());
  allowed boolean;
  root_node jsonb;
  nodes jsonb;
  total integer;
begin
  if me is null or not exists(select 1 from public.members where role='member' and id=me and status='active') then
    raise exception '로그인이 필요합니다.' using errcode='42501';
  end if;
  if p_mode not in ('referral','sponsor') or p_mode is null or p_depth is null or p_depth < 0 or p_depth not in (0,3,5,10,15,20) then
    raise exception '조직도 조회 조건을 확인하세요.';
  end if;

  with recursive ancestors as (
    select m.id, case when p_mode='referral' then m.referrer_id else m.sponsor_id end as parent
    from public.members m
    where m.role='member' and m.id=root_id
    union
    select m.id, case when p_mode='referral' then m.referrer_id else m.sponsor_id end
    from public.members m
    join ancestors a on m.id=a.parent
    where m.role='member'
  ) select exists(select 1 from ancestors where id=me) into allowed;
  if not allowed then raise exception '본인 산하만 조회할 수 있습니다.' using errcode='42501'; end if;

  select jsonb_build_object(
    'id',m.id,
    'name',m.name,
    'member_code',m.member_code,
    'phone',m.phone,
    'created_at',m.created_at,
    'sales_pv',coalesce((select sum(p.pv) from public.purchases p where p.member_id=m.id and p.payment_method='pv'),0),
    'position',case when p_mode='sponsor' then m.position else null end,
    'parent_id',null,
    'depth',0,
    'has_children',exists(select 1 from public.members c where c.role='member' and case when p_mode='referral' then c.referrer_id else c.sponsor_id end=m.id)
  ) into root_node
  from public.members m
  where m.role='member' and m.id=root_id;

  with recursive tree as (
    select
      m.id,
      m.name,
      m.member_code,
      m.phone,
      m.created_at,
      m.position,
      null::uuid as parent_id,
      0 as depth
    from public.members m
    where m.role='member' and m.id=root_id
    union all
    select
      c.id,
      c.name,
      c.member_code,
      c.phone,
      c.created_at,
      c.position,
      t.id as parent_id,
      t.depth + 1 as depth
    from public.members c
    join tree t on case when p_mode='referral' then c.referrer_id=t.id else c.sponsor_id=t.id end
    where c.role='member' and (p_depth=0 or t.depth < p_depth)
  ), packed as (
    select
      t.*,
      coalesce((select sum(p.pv) from public.purchases p where p.member_id=t.id and p.payment_method='pv'),0) as sales_pv,
      exists(select 1 from public.members c where c.role='member' and case when p_mode='referral' then c.referrer_id else c.sponsor_id end=t.id) as has_children
    from tree t
    where t.depth > 0
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',id,
          'name',name,
          'member_code',member_code,
          'phone',phone,
          'created_at',created_at,
          'sales_pv',sales_pv,
          'position',case when p_mode='sponsor' then position else null end,
          'parent_id',parent_id,
          'depth',depth,
          'has_children',has_children
        )
        order by depth, parent_id, case when p_mode='sponsor' then coalesce(position,'') else member_code end, member_code, id
      ),
      '[]'::jsonb
    )
  into total, nodes
  from packed;

  return jsonb_build_object('root',root_node,'nodes',nodes,'children','[]'::jsonb,'total',total);
end $$;

create or replace function public.my_organization_tree(p_mode text,p_root uuid default null,p_depth integer default 3) returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.my_organization_tree(p_mode,p_root,p_depth)
$$;

revoke all on function private.my_organization_tree(text,uuid,integer) from public, anon, authenticated;
revoke all on function public.my_organization_tree(text,uuid,integer) from public, anon, authenticated;
grant execute on function private.my_organization_tree(text,uuid,integer) to authenticated;
grant execute on function public.my_organization_tree(text,uuid,integer) to authenticated;
