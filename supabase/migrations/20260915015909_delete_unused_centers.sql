create or replace function private.delete_center(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers%rowtype;
begin
  perform private.require_admin();
  perform pg_advisory_xact_lock(870031);

  select * into v_center
  from public.centers
  where id = p_id
  for update;

  if not found then
    raise exception '센터를 찾을 수 없습니다.';
  end if;

  if exists (select 1 from public.members where center_id = p_id) then
    raise exception '소속 회원이 있는 센터는 삭제할 수 없습니다.';
  end if;

  if exists (select 1 from private.center_sales where center_id = p_id)
    or exists (select 1 from public.center_referral_unpaid where center_id = p_id)
    or exists (
      select 1
      from public.bonuses
      where (kind = 'center' and event_key like ('center:%:' || p_id::text))
        or (kind = 'center_referral' and event_key like ('center-referral:%:' || p_id::text || ':%'))
    ) then
    raise exception '매출 또는 보너스 기록이 있는 센터는 삭제할 수 없습니다.';
  end if;

  delete from public.centers where id = p_id;

  insert into public.audits(action, actor, detail)
  values ('센터 삭제', auth.uid()::text, v_center.name);
end;
$$;

create or replace function public.delete_center(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_center(p_id);
$$;

revoke all on function private.delete_center(uuid) from public, anon, authenticated;
revoke all on function public.delete_center(uuid) from public, anon, authenticated;
grant execute on function private.delete_center(uuid) to authenticated;
grant execute on function public.delete_center(uuid) to authenticated;

