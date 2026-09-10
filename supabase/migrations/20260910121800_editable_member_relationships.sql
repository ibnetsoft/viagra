-- Admin may change purchased members and move branches; cycle and seat constraints remain.
create or replace function private.update_member(p_member uuid,p_name text,p_phone text,p_postcode text,p_address text,p_detail text,p_status text,p_referrer uuid,p_sponsor uuid,p_position text,p_center uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.members; cycle_found boolean;
begin
  perform pg_advisory_xact_lock(870031); perform private.require_admin();
  perform private.close_due((now() at time zone 'Asia/Seoul')::date-1);
  select * into m from public.members where id=p_member for update;
  if not found then raise exception '회원을 찾을 수 없습니다.'; end if;
  if p_member=auth.uid() and p_status<>'active' then raise exception '자신의 계정을 정지할 수 없습니다.'; end if;
  with recursive ancestors as (
    select id,referrer_id from public.members where id=p_referrer
    union select x.id,x.referrer_id from public.members x join ancestors a on x.id=a.referrer_id
  ) select exists(select 1 from ancestors where id=p_member) into cycle_found;
  if cycle_found then raise exception '추천 관계가 순환합니다.'; end if;
  with recursive ancestors as (
    select id,sponsor_id from public.members where id=p_sponsor
    union select x.id,x.sponsor_id from public.members x join ancestors a on x.id=a.sponsor_id
  ) select exists(select 1 from ancestors where id=p_member) into cycle_found;
  if cycle_found then raise exception '후원 관계가 순환합니다.'; end if;
  update public.members set name=trim(p_name),phone=p_phone,postcode=p_postcode,address=trim(p_address),address_detail=p_detail,
    status=p_status,referrer_id=p_referrer,sponsor_id=p_sponsor,position=p_position,center_id=p_center where id=p_member;
  if m.referrer_id is distinct from p_referrer or m.sponsor_id is distinct from p_sponsor or m.position is distinct from p_position then
    insert into public.audits(action,actor,detail) values('추천·후원 변경',auth.uid()::text,
      jsonb_build_object('member',m.member_code,'before',jsonb_build_object('referrer',m.referrer_id,'sponsor',m.sponsor_id,'position',m.position),'after',jsonb_build_object('referrer',p_referrer,'sponsor',p_sponsor,'position',p_position))::text);
  end if;
  insert into public.audits(action,actor,detail) values('회원 수정',auth.uid()::text,m.member_code||' · 상태 '||p_status);
end $$;
