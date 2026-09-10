-- Account details are optional at signup; partially supplied details must be valid.
create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare b text:=new.raw_user_meta_data->>'bank_name'; a text:=regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'[- ]','','g'); h text:=trim(new.raw_user_meta_data->>'account_holder');
begin
 if coalesce(trim(b),'')='' and coalesce(a,'')='' and coalesce(h,'')='' then b:=null;a:=null;h:=null;
 elsif not private.valid_bank(b,a,h) then raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';end if;
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder)
 values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'postcode',trim(new.raw_user_meta_data->>'address'),coalesce(new.raw_user_meta_data->>'address_detail',''),b,a,h);
 return new;
end $$;
