alter table public.members add column bank_name text,add column account_number text,add column account_holder text;
create function private.valid_bank(p_bank text,p_account text,p_holder text) returns boolean language sql immutable set search_path='' as $$ select coalesce(p_bank=any(array['KB국민은행','신한은행','우리은행','하나은행','NH농협은행','IBK기업은행','KDB산업은행','Sh수협은행','SC제일은행','한국씨티은행','카카오뱅크','케이뱅크','토스뱅크','iM뱅크','부산은행','경남은행','광주은행','전북은행','제주은행','농·축협','신협','새마을금고','산림조합','우체국','저축은행']) and p_account ~ '^[0-9]{8,20}$' and length(trim(p_holder)) between 1 and 80,false) $$;
revoke all on function private.valid_bank(text,text,text) from public,anon;
grant execute on function private.valid_bank(text,text,text) to authenticated;
alter table public.members add constraint member_bank_valid check((bank_name is null and account_number is null and account_holder is null) or private.valid_bank(bank_name,account_number,account_holder));
create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare b text:=new.raw_user_meta_data->>'bank_name'; a text:=regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'[- ]','','g'); h text:=trim(new.raw_user_meta_data->>'account_holder');
begin
 if not private.valid_bank(b,a,h) then raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';end if;
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder)
 values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'postcode',trim(new.raw_user_meta_data->>'address'),coalesce(new.raw_user_meta_data->>'address_detail',''),b,a,h);
 return new;
end $$;
create function private.update_my_bank(p_bank text,p_account text,p_holder text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.members where id=auth.uid() and status='active') then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 if not private.valid_bank(p_bank,p_account,p_holder) then raise exception '계좌 정보를 확인하세요.';end if;
 update public.members set bank_name=p_bank,account_number=p_account,account_holder=trim(p_holder) where id=auth.uid();
 insert into public.audits(action,actor,detail) values('본인 계좌 수정',auth.uid()::text,'계좌 정보 변경');
end $$;
create function public.update_my_bank(p_bank text,p_account text,p_holder text) returns void language sql security invoker set search_path='' as $$ select private.update_my_bank(p_bank,p_account,p_holder) $$;
create function private.update_member_with_bank(p_member uuid,p_name text,p_phone text,p_postcode text,p_address text,p_detail text,p_status text,p_referrer uuid,p_sponsor uuid,p_position text,p_center uuid,p_bank text,p_account text,p_holder text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 perform private.update_member(p_member,p_name,p_phone,p_postcode,p_address,p_detail,p_status,p_referrer,p_sponsor,p_position,p_center);
 if p_bank is null and p_account is null and p_holder is null and not exists(select 1 from public.members where id=p_member and bank_name is not null) then return;end if;
 if not private.valid_bank(p_bank,p_account,p_holder) then raise exception '계좌 정보를 모두 확인하세요.';end if;
 update public.members set bank_name=p_bank,account_number=p_account,account_holder=trim(p_holder) where id=p_member;
end $$;
create function public.update_member_with_bank(p_member uuid,p_name text,p_phone text,p_postcode text,p_address text,p_detail text,p_status text,p_referrer uuid,p_sponsor uuid,p_position text,p_center uuid,p_bank text,p_account text,p_holder text) returns void language sql security invoker set search_path='' as $$ select private.update_member_with_bank(p_member,p_name,p_phone,p_postcode,p_address,p_detail,p_status,p_referrer,p_sponsor,p_position,p_center,p_bank,p_account,p_holder) $$;
revoke all on function private.update_my_bank(text,text,text),public.update_my_bank(text,text,text),private.update_member_with_bank(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid,text,text,text),public.update_member_with_bank(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.update_my_bank(text,text,text),public.update_my_bank(text,text,text),private.update_member_with_bank(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid,text,text,text),public.update_member_with_bank(uuid,text,text,text,text,text,text,uuid,uuid,text,uuid,text,text,text) to authenticated;
