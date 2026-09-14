create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare
 b text:=nullif(trim(coalesce(new.raw_user_meta_data->>'bank_name','')),'');
 a text:=nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'\D','','g'),'');
 h text:=nullif(trim(coalesce(new.raw_user_meta_data->>'account_holder','')),'');
 placement jsonb;
begin
 if b is null and a is null and h is null then
  b:=null;a:=null;h:=null;
 elsif not private.valid_bank(b,a,h) then
  raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';
 end if;
 placement:=private.signup_placement(new.raw_user_meta_data->>'referrer_username','','',nullif(new.raw_user_meta_data->>'signup_center_id','')::uuid);
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder,username,referrer_id,sponsor_id,position,center_id)
 values(
  new.id,
  trim(new.raw_user_meta_data->>'name'),
  coalesce(nullif(trim(new.raw_user_meta_data->>'signup_email'),''),new.email),
  new.raw_user_meta_data->>'phone',
  trim(coalesce(new.raw_user_meta_data->>'postcode','')),
  trim(coalesce(new.raw_user_meta_data->>'address','')),
  coalesce(new.raw_user_meta_data->>'address_detail',''),
  b,
  a,
  h,
  lower(trim(new.raw_user_meta_data->>'username')),
  (placement->>'referrer_id')::uuid,
  (placement->>'sponsor_id')::uuid,
  placement->>'position',
  (placement->>'center_id')::uuid
 );
 return new;
end $$;

comment on function private.on_signup() is 'Creates the member profile from Auth signup metadata. signup_email stores the user-visible email so duplicate contact emails can be used while Auth keeps a unique internal email.';
