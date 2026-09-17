create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  amount bigint not null check (amount > 0),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  admin_note text not null default '',
  processed_by uuid references public.members(id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'pending' or (processed_by is not null and processed_at is not null))
);
create index withdrawals_member_idx on public.withdrawals(member_id,created_at desc);
create index withdrawals_status_idx on public.withdrawals(status,created_at desc);
alter table public.withdrawals enable row level security;
create policy withdrawals_read on public.withdrawals for select to authenticated using (member_id=(select auth.uid()) or (select private.is_admin()));
grant select on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;

create function private.withdrawal_available(p_member uuid) returns bigint language sql stable security definer set search_path='' as $$
  select greatest(
    0,
    coalesce((select sum(paid) from public.bonuses where member_id=p_member),0) -
    coalesce((select sum(amount) from public.withdrawals where member_id=p_member and status in ('pending','approved')),0)
  )::bigint
$$;
revoke all on function private.withdrawal_available(uuid) from public,anon,authenticated;
grant execute on function private.withdrawal_available(uuid) to authenticated;

create function private.update_my_profile(p_email text,p_phone text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.members where id=auth.uid() and role='member' and status='active') then
  raise exception '로그인이 필요합니다.' using errcode='42501';
 end if;
 if p_email is null or trim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then
  raise exception '이메일 주소를 확인하세요.';
 end if;
 if p_phone is null or p_phone !~ '^[0-9+\- ]{9,20}$' then
  raise exception '전화번호를 확인하세요.';
 end if;
 update public.members set email=trim(p_email),phone=p_phone where id=auth.uid();
 insert into public.audits(action,actor,detail) values('본인 기본정보 수정',auth.uid()::text,'이메일/전화번호 변경');
end $$;
create function public.update_my_profile(p_email text,p_phone text) returns void language sql security invoker set search_path='' as $$
 select private.update_my_profile(p_email,p_phone)
$$;

create function private.update_my_address(p_postcode text,p_address text,p_detail text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.members where id=auth.uid() and role='member' and status='active') then
  raise exception '로그인이 필요합니다.' using errcode='42501';
 end if;
 if coalesce(p_postcode,'') !~ '^(\d{5})?$' or length(trim(coalesce(p_address,''))) > 200 or length(trim(coalesce(p_detail,''))) > 200 then
  raise exception '배송지 정보를 확인하세요.';
 end if;
 update public.members set postcode=trim(coalesce(p_postcode,'')),address=trim(coalesce(p_address,'')),address_detail=trim(coalesce(p_detail,'')) where id=auth.uid();
 insert into public.audits(action,actor,detail) values('본인 배송지 수정',auth.uid()::text,'배송지 변경');
end $$;
create function public.update_my_address(p_postcode text,p_address text,p_detail text) returns void language sql security invoker set search_path='' as $$
 select private.update_my_address(p_postcode,p_address,p_detail)
$$;

create function private.request_withdrawal(p_amount bigint,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); m record; available bigint; new_id uuid;
begin
 if me is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 select * into m from public.members where id=me and role='member' and status='active';
 if not found then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if m.bank_name is null or m.account_number is null or m.account_holder is null then raise exception '출금 계좌를 먼저 등록하세요.'; end if;
 if p_amount is null or p_amount <= 0 then raise exception '출금 금액을 확인하세요.'; end if;
 available := private.withdrawal_available(me);
 if p_amount > available then raise exception '출금 가능액이 부족합니다.'; end if;
 insert into public.withdrawals(member_id,amount,bank_name,account_number,account_holder,note)
 values(me,p_amount,m.bank_name,m.account_number,m.account_holder,left(trim(coalesce(p_note,'')),500)) returning id into new_id;
 insert into public.audits(action,actor,detail) values('출금 신청',me::text,p_amount::text||'원');
 return new_id;
end $$;
create function public.request_withdrawal(p_amount bigint,p_note text default '') returns uuid language sql security invoker set search_path='' as $$
 select private.request_withdrawal(p_amount,p_note)
$$;

create function private.process_withdrawal(p_id uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare target record;
begin
 perform private.require_admin();
 if p_status not in ('approved','rejected') then raise exception '처리 상태를 확인하세요.'; end if;
 select * into target from public.withdrawals where id=p_id for update;
 if not found then raise exception '출금 신청을 찾을 수 없습니다.'; end if;
 if target.status <> 'pending' then raise exception '이미 처리된 출금 신청입니다.'; end if;
 update public.withdrawals set status=p_status,admin_note=left(trim(coalesce(p_note,'')),500),processed_by=auth.uid(),processed_at=now() where id=p_id;
 insert into public.audits(action,actor,detail) values(case when p_status='approved' then '출금 승인' else '출금 반려' end,auth.uid()::text,target.amount::text||'원');
end $$;
create function public.process_withdrawal(p_id uuid,p_status text,p_note text default '') returns void language sql security invoker set search_path='' as $$
 select private.process_withdrawal(p_id,p_status,p_note)
$$;

revoke all on function private.update_my_profile(text,text),public.update_my_profile(text,text),private.update_my_address(text,text,text),public.update_my_address(text,text,text),private.request_withdrawal(bigint,text),public.request_withdrawal(bigint,text),private.process_withdrawal(uuid,text,text),public.process_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_my_profile(text,text),public.update_my_address(text,text,text),public.request_withdrawal(bigint,text),public.process_withdrawal(uuid,text,text) to authenticated;
grant execute on function private.update_my_profile(text,text),private.update_my_address(text,text,text),private.request_withdrawal(bigint,text),private.process_withdrawal(uuid,text,text) to authenticated;
