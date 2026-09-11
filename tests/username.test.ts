import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { usernameField } from '../src/lib/username';

test('usernames: signup uniqueness, normalization, legacy IDs and server-only email resolution',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role service_role bypassrls;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  const migration=files.find(f=>f.includes('member_usernames'))!;
  for(const file of files.filter(f=>f<migration)) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const signup=(username?:string)=>db.query('insert into auth.users values($1,$2,$3) returning id',[crypto.randomUUID(),'member@example.invalid',JSON.stringify({name:'아이디 테스트',phone:'010-0000-0000',...(username===undefined?{}:{username})})]);
  const legacy=(await signup()).rows[0] as {id:string};
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const legacyMember=(await db.query<any>('select member_code,username from public.members where id=$1',[legacy.id])).rows[0];
  assert.equal(legacyMember.username,legacyMember.member_code.toLowerCase());
  const member=(await signup(' New_User ')).rows[0] as {id:string};
  assert.equal((await db.query<any>('select username from public.members where id=$1',[member.id])).rows[0].username,'new_user');
  await assert.rejects(signup('NEW_USER'),/members_username_unique/);
  for(const invalid of ['abc','1user','a@user','한글아이디','a'.repeat(21)]) await assert.rejects(signup(invalid),/members_username_format/);
  assert.equal(usernameField.parse(' New_User '),'new_user');
  await db.exec('set role service_role');
  assert.equal((await db.query<any>("select public.resolve_login_email('NEW_USER') email")).rows[0].email,'member@example.invalid');
  assert.equal((await db.query<any>("select public.resolve_login_email('missing_user') email")).rows[0].email,null);
  await db.exec('reset role');
  await db.query('update auth.users set email=$1 where id=$2',['new-email@example.invalid',member.id]);
  await db.exec('set role service_role');
  assert.equal((await db.query<any>("select public.resolve_login_email('new_user') email")).rows[0].email,'new-email@example.invalid');
  for(const role of ['anon','authenticated']) {
   await db.exec('reset role;set role '+role);
   await assert.rejects(db.exec("select public.resolve_login_email('new_user')"),/permission denied/);
  }
 } finally {await db.close();}
});
