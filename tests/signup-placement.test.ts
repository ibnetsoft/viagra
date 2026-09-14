import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('signup saves independent relationships and center atomically, rejects occupied/admin/invalid choices',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role service_role bypassrls;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  const signup=async(username:string,extra:Record<string,string>={})=>{
   const id=crypto.randomUUID();
   await db.query('insert into auth.users values($1,$2,$3)',[id,username+'@example.invalid',JSON.stringify({username,name:'가입 테스트',phone:'010-0000-0000',...extra})]);return id;
  };
  const ref=await signup('referrer'),sponsor=await signup('sponsor'),admin=await signup('admin_test');
  await db.query("update public.members set role='admin' where id=$1",[admin]);
  const center=crypto.randomUUID();await db.query("insert into public.centers values($1,'테스트 센터',$2)",[center,ref]);
  const details={referrer_username:'REFERRER',sponsor_username:'sponsor',sponsor_position:'L',signup_center_id:center};
  const id=await signup('new_member',details);
  const second=await signup('second_member',details);
  const profile=(await db.query<any>('select referrer_id,sponsor_id,position,center_id,role from public.members where id=$1',[id])).rows[0];
  assert.deepEqual(profile,{referrer_id:ref,sponsor_id:null,position:null,center_id:center,role:'member'});
  await assert.rejects(signup('bad_ref',{referrer_username:'missing'}),/추천인 아이디/);
  await assert.rejects(signup('bad_center',{signup_center_id:crypto.randomUUID()}),/센터/);
  // Forged signup placement metadata is ignored, including admin and invalid seats.
  const ignored=await signup('ignored_slot',{sponsor_username:'admin_test',sponsor_position:'R'});
  assert.equal((await db.query<any>('select sponsor_id from public.members where id=$1',[ignored])).rows[0].sponsor_id,null);
  await db.query("update public.members set sponsor_id=$1,position='L' where id=$2",[ref,sponsor]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ref]);
  await db.exec('set role authenticated');
  const waiting=(await db.query<any>('select public.my_unplaced_members() data')).rows[0].data;
  assert.deepEqual(new Set(waiting.map((m:any)=>m.id)),new Set([id,second]));
  await assert.rejects(db.query("select public.place_my_member($1,$2,'L')",[ignored,ref]),/직접 추천/);
  await assert.rejects(db.query("select public.place_my_member($1,$2,'L')",[id,ignored]),/후원 산하/);
  await assert.rejects(db.query("select public.place_my_member($1,$2,'L')",[id,id]),/순환/);
  await assert.rejects(db.query("select public.place_my_member($1,$2,'L')",[id,ref]),/이미 사용 중/);
  await db.query("select public.place_my_member($1,$2,'R')",[id,sponsor]);
  await assert.rejects(db.query("select public.place_my_member($1,$2,'R')",[id,ref]),/이미 배치/);
  await assert.rejects(db.query("select public.place_my_member($1,$2,'R')",[second,sponsor]),/이미 사용 중/);
  await db.query("select public.place_my_member($1,$2,'R')",[second,ref]);
  assert.equal((await db.query<any>('select public.my_unplaced_members() data')).rows[0].data.length,0);
  await db.exec('reset role');
  const placed=(await db.query<any>('select sponsor_id,position,referrer_id from public.members where id=$1',[id])).rows[0];
  assert.deepEqual(placed,{sponsor_id:sponsor,position:'R',referrer_id:ref});
  await db.query("update public.members set status='suspended' where id=$1",[ref]);
  await assert.rejects(signup('inactive_ref',{referrer_username:'referrer'}),/추천인 아이디/);
  await db.exec('set role anon');
  await assert.rejects(db.exec("select public.validate_signup_placement('referrer','','',null)"),/permission denied/);
 await assert.rejects(db.exec('select public.my_unplaced_members()'),/permission denied/);
 } finally {await db.close();}
});
