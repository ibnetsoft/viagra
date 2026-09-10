-- Run as database owner after the announcement migration.
-- Provision vital_push_cron_secret in Vault separately; never put the value here.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function private.dispatch_push_worker() returns bigint
language plpgsql security definer set search_path='' as $$
declare token text;request_id bigint;
begin
 if not exists(select 1 from public.push_deliveries where
   (status='pending' and next_attempt_at<=now()) or
   (status='sending' and locked_at<now()-interval '5 minutes')) then return null;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='vital_push_cron_secret';
 if token is null then raise exception 'Push worker secret is missing';end if;
 select net.http_post(
   url:='https://viagra-iota.vercel.app/api/push/dispatch',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:='{}'::jsonb,timeout_milliseconds:=55000
 ) into request_id;
 return request_id;
end $$;
revoke all on function private.dispatch_push_worker() from public,anon,authenticated,service_role;
select cron.schedule('vital-push-dispatch','* * * * *',$$select private.dispatch_push_worker();$$);
