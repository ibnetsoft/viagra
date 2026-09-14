create function private.update_center(p_id uuid,p_name text,p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 perform pg_advisory_xact_lock(870031);
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception '센터명을 확인하세요.'; end if;
 if not exists(select 1 from public.members where id=p_owner and role='member' and status='active') then raise exception '정상 회원을 센터장으로 선택하세요.'; end if;
 update public.centers set name=trim(p_name),owner_id=p_owner where id=p_id;
 if not found then raise exception '센터를 찾을 수 없습니다.'; end if;
 insert into public.audits(action,actor,detail) values('센터 수정',auth.uid()::text,p_id||' · '||trim(p_name));
end $$;
create function public.update_center(p_id uuid,p_name text,p_owner uuid) returns void
language sql security invoker set search_path='' as $$ select private.update_center(p_id,p_name,p_owner) $$;
revoke all on function private.update_center(uuid,text,uuid),public.update_center(uuid,text,uuid) from public,anon;
grant execute on function private.update_center(uuid,text,uuid),public.update_center(uuid,text,uuid) to authenticated;

create function private.admin_center_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('center_id',c.id,'sales_pv',coalesce(s.total,0),'today_pv',coalesce(s.today,0)))
 from public.centers c left join (
 select center_id,sum(pv) total,sum(pv) filter(where day=(now() at time zone 'Asia/Seoul')::date) today
 from private.center_sales group by center_id
 ) s on s.center_id=c.id),'[]'::jsonb);
end $$;
create function public.admin_center_stats() returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_center_stats() $$;
revoke all on function private.admin_center_stats(),public.admin_center_stats() from public,anon;
grant execute on function private.admin_center_stats(),public.admin_center_stats() to authenticated;
