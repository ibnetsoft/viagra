-- Check signup placement both before signup and inside the atomic Auth trigger.
create function private.signup_placement(p_referrer text,p_sponsor text,p_position text,p_center uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r uuid; s uuid; pos text:=nullif(trim(p_position),'');
begin
 perform pg_advisory_xact_lock(870031);
 if coalesce(trim(p_referrer),'')<>'' then
  select id into r from public.members where username=lower(trim(p_referrer)) and role='member' and status='active';
  if r is null then raise exception '추천인 아이디를 확인하세요. 활동 중인 회원만 지정할 수 있습니다.';end if;
 end if;
 if coalesce(trim(p_sponsor),'')<>'' then
  select id into s from public.members where username=lower(trim(p_sponsor)) and role='member' and status='active';
  if s is null then raise exception '후원인 아이디를 확인하세요. 활동 중인 회원만 지정할 수 있습니다.';end if;
  if pos is null or pos not in ('L','R') then raise exception '후원인의 좌·우 자리를 선택하세요.';end if;
  if exists(select 1 from public.members where sponsor_id=s and position=pos) then raise exception '선택한 후원인의 자리가 이미 사용 중입니다. 다른 자리 또는 후원인을 선택하세요.';end if;
 elsif pos is not null then raise exception '후원인 아이디를 먼저 입력하세요.';
 end if;
 if p_center is not null and not exists(select 1 from public.centers c join public.members m on m.id=c.owner_id where c.id=p_center and m.role='member' and m.status='active') then raise exception '선택한 센터를 확인하세요.';end if;
 return jsonb_build_object('referrer_id',r,'sponsor_id',s,'position',pos,'center_id',p_center);
end $$;
revoke all on function private.signup_placement(text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.signup_placement(text,text,text,uuid) to service_role;
create function public.validate_signup_placement(p_referrer text,p_sponsor text,p_position text,p_center uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.signup_placement(p_referrer,p_sponsor,p_position,p_center); $$;
revoke all on function public.validate_signup_placement(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.validate_signup_placement(text,text,text,uuid) to service_role;

create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare b text:=new.raw_user_meta_data->>'bank_name'; a text:=regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'[- ]','','g'); h text:=trim(new.raw_user_meta_data->>'account_holder'); placement jsonb;
begin
 if coalesce(trim(b),'')='' and coalesce(a,'')='' and coalesce(h,'')='' then b:=null;a:=null;h:=null;
 elsif not private.valid_bank(b,a,h) then raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';end if;
 placement:=private.signup_placement(new.raw_user_meta_data->>'referrer_username',new.raw_user_meta_data->>'sponsor_username',new.raw_user_meta_data->>'sponsor_position',nullif(new.raw_user_meta_data->>'signup_center_id','')::uuid);
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder,username,referrer_id,sponsor_id,position,center_id)
 values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',trim(coalesce(new.raw_user_meta_data->>'postcode','')),trim(coalesce(new.raw_user_meta_data->>'address','')),coalesce(new.raw_user_meta_data->>'address_detail',''),b,a,h,lower(trim(new.raw_user_meta_data->>'username')),(placement->>'referrer_id')::uuid,(placement->>'sponsor_id')::uuid,placement->>'position',(placement->>'center_id')::uuid);
 return new;
end $$;

