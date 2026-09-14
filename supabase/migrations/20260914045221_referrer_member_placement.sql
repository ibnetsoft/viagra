create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare b text:=new.raw_user_meta_data->>'bank_name'; a text:=regexp_replace(coalesce(new.raw_user_meta_data->>'account_number',''),'[- ]','','g'); h text:=trim(new.raw_user_meta_data->>'account_holder'); placement jsonb;
begin
 if coalesce(trim(b),'')='' and coalesce(a,'')='' and coalesce(h,'')='' then b:=null;a:=null;h:=null;
 elsif not private.valid_bank(b,a,h) then raise exception '은행, 계좌번호, 예금주를 모두 확인하세요.';end if;
 placement:=private.signup_placement(new.raw_user_meta_data->>'referrer_username','','',nullif(new.raw_user_meta_data->>'signup_center_id','')::uuid);
 insert into public.members(id,name,email,phone,postcode,address,address_detail,bank_name,account_number,account_holder,username,referrer_id,sponsor_id,position,center_id)
 values(new.id,trim(new.raw_user_meta_data->>'name'),new.email,new.raw_user_meta_data->>'phone',trim(coalesce(new.raw_user_meta_data->>'postcode','')),trim(coalesce(new.raw_user_meta_data->>'address','')),coalesce(new.raw_user_meta_data->>'address_detail',''),b,a,h,lower(trim(new.raw_user_meta_data->>'username')),(placement->>'referrer_id')::uuid,(placement->>'sponsor_id')::uuid,placement->>'position',(placement->>'center_id')::uuid);
 return new;
end $$;


create function private.my_unplaced_members() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.members where id=auth.uid() and role='member' and status='active') then raise exception '회원 로그인이 필요합니다.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'username',username,'member_code',member_code) order by created_at,id)
 from public.members where referrer_id=auth.uid() and sponsor_id is null and role='member' and status='active'),'[]'::jsonb);
end $$;
create function public.my_unplaced_members() returns jsonb language sql stable security invoker set search_path='' as $$ select private.my_unplaced_members() $$;
create function private.place_my_member(p_member uuid,p_sponsor uuid,p_position text) returns void language plpgsql security definer set search_path='' as $$
declare m public.members; allowed boolean; cycle_found boolean;
begin
 perform pg_advisory_xact_lock(870031);
 if not exists(select 1 from public.members where id=auth.uid() and role='member' and status='active') then raise exception '회원 로그인이 필요합니다.'; end if;
 if p_position is null or p_position not in ('L','R') then raise exception '좌·우 자리를 선택하세요.'; end if;
 select * into m from public.members where id=p_member for update;
 if not found or m.referrer_id is distinct from auth.uid() or m.role<>'member' or m.status<>'active' then raise exception '직접 추천한 정상 회원만 배치할 수 있습니다.'; end if;
 if m.sponsor_id is not null then raise exception '이미 배치된 회원입니다. 변경은 관리자에게 요청하세요.'; end if;
 if not exists(select 1 from public.members where id=p_sponsor and role='member' and status='active') then raise exception '후원인을 확인하세요.'; end if;
 with recursive ancestors as (
 select id,sponsor_id from public.members where id=p_sponsor
 union select x.id,x.sponsor_id from public.members x join ancestors a on x.id=a.sponsor_id
 ) select bool_or(id=auth.uid()),bool_or(id=p_member) into allowed,cycle_found from ancestors;
 if coalesce(cycle_found,false) then raise exception '본인 또는 하위 회원 아래로 순환 배치할 수 없습니다.'; end if;
 if not coalesce(allowed,false) then raise exception '본인 또는 본인의 후원 산하에만 배치할 수 있습니다.'; end if;
 if exists(select 1 from public.members where sponsor_id=p_sponsor and position=p_position) then raise exception '이미 사용 중인 자리입니다. 조직도를 새로 확인하고 다른 자리를 선택하세요.'; end if;
 update public.members set sponsor_id=p_sponsor,position=p_position where id=p_member;
 insert into public.audits(action,actor,detail) values('추천 회원 배치',auth.uid()::text,jsonb_build_object('member',p_member,'sponsor',p_sponsor,'position',p_position)::text);
end $$;
create function public.place_my_member(p_member uuid,p_sponsor uuid,p_position text) returns void language sql security invoker set search_path='' as $$ select private.place_my_member(p_member,p_sponsor,p_position) $$;
revoke all on function private.my_unplaced_members(),public.my_unplaced_members(),private.place_my_member(uuid,uuid,text),public.place_my_member(uuid,uuid,text) from public,anon;
grant execute on function private.my_unplaced_members(),public.my_unplaced_members(),private.place_my_member(uuid,uuid,text),public.place_my_member(uuid,uuid,text) to authenticated;
