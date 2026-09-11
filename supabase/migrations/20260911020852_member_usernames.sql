alter table public.members add column username text;
update public.members set username=lower(member_code);
alter table public.members add constraint members_username_unique unique(username),
 add constraint members_username_format check(username ~ '^[a-z][a-z0-9_]{3,19}$');
-- Compatibility for existing integrations: assign a stable ID when not supplied.
create function private.assign_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.username:=lower(trim(coalesce(new.username,'')));
 if new.username='' then new.username:=lower(new.member_code); end if;
 return new;
end $$;
revoke all on function private.assign_username() from public,anon,authenticated;
create trigger assign_username before insert on public.members for each row execute function private.assign_username();
alter table public.members alter column username set not null;

create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare b text:=new.raw_user_meta_data->>'bank_name'; a text:=regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'[- ]','','g'); h text:=trim(new.raw_user_meta_data->>'account_holder');
begin
 if coalesce(trim(b),'')='' and coalesce(a,'')='' and coalesce(h,'')='' then b:=null;a:=null;h:=null;
 elsif not private.valid_bank(b,a,h) then raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';end if;
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder,username)
 values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',trim(coalesce(new.raw_user_meta_data->>'postcode','')),trim(coalesce(new.raw_user_meta_data->>'address','')),coalesce(new.raw_user_meta_data->>'address_detail',''),b,a,h,lower(trim(new.raw_user_meta_data->>'username')));
 return new;
end $$;

-- Resolve login names only on the server. Never expose email lookup to anonymous clients.
create function private.resolve_login_email(p_username text) returns text language sql stable security definer set search_path='' as $$
 select u.email from public.members m join auth.users u on u.id=m.id where m.username=lower(trim(p_username));
$$;
revoke all on function private.resolve_login_email(text) from public,anon,authenticated;
grant execute on function private.resolve_login_email(text) to service_role;
create function public.resolve_login_email(p_username text) returns text language sql stable security invoker set search_path='' as $$
 select private.resolve_login_email(p_username);
$$;
revoke all on function public.resolve_login_email(text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.resolve_login_email(text) to service_role;
