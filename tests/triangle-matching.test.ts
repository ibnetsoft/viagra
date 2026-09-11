import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("recurring triangles: migration preserves ledger, queued purchases, all depths, retries and expiry", async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon;create role service_role bypassrls;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  const migration=files.find(f=>f.includes('recurring_triangle_matching'))!;
  for(const file of files.filter(f=>f<migration)) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const ids=Array.from({length:15},()=>crypto.randomUUID());
  for(let i=0;i<ids.length;i++) {
   await db.query('insert into auth.users values($1,$2,$3)',[ids[i],ids[i]+'@example.invalid',JSON.stringify({name:'매칭테스트',phone:'010-0000-0000'})]);
   await db.query('update public.members set pv=3000000,sponsor_id=$2,position=$3 where id=$1',[ids[i],i?ids[Math.floor((i-1)/2)]:null,i?(i%2?'L':'R'):null]);
  }
  const product=(await db.query<any>('select id from public.products where active limit 1')).rows[0].id;
  const buy=async(i:number,request=crypto.randomUUID())=>{
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);
   await db.query('select public.buy_product($1,$2)',[product,request]);return request;
  };
  const triangleCounts=async()=> (await db.query<any>("select kind,count(*)::int as n from public.bonuses where kind like 'triangle%' group by kind order by kind")).rows;
  for(let i=0;i<15;i++) await buy(i);
  const initial=await triangleCounts();
  assert.deepEqual(initial,[{kind:'triangle1',n:7},{kind:'triangle2',n:6},{kind:'triangle3',n:4}]);
  // One-sided repeat purchase before migration must remain waiting.
  await buy(1);
  const ledgerBefore=(await db.query('select * from public.bonuses order by id')).rows;
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  assert.deepEqual((await db.query('select * from public.bonuses order by id')).rows,ledgerBefore);
  assert.equal((await db.query<any>('select count(*)::int n from private.triangle_matches where migrated')).rows[0].n,7);
  await buy(0);
  assert.deepEqual(await triangleCounts(),initial);
  const req=await buy(2); // finishes the root's second triangle
  await buy(2,req); // retry cannot add a credit or payout
  assert.equal((await db.query<any>("select count(*)::int n from public.bonuses where member_id=$1 and kind='triangle1'",[ids[0]])).rows[0].n,2);
  for(let i=3;i<15;i++) await buy(i);
  assert.deepEqual(await triangleCounts(),[{kind:'triangle1',n:14},{kind:'triangle2',n:12},{kind:'triangle3',n:8}]);
  // Left can buy two rounds ahead; right alone cannot reuse the root's purchase.
  await buy(1);await buy(1);await buy(2);
  assert.equal((await db.query<any>("select count(*)::int n from public.bonuses where member_id=$1 and kind='triangle1'",[ids[0]])).rows[0].n,2);
  await buy(0); // third round consumes one of the two left credits
  await buy(0); // fourth round still waits for right
  await db.query('update public.members set bonus_limit=bonus_paid+30000 where id=$1',[ids[0]]);
  await buy(2); // 10k rollup, then only 20k available for 90k triangle
  const capped=(await db.query<any>("select paid,expired from public.bonuses where member_id=$1 and kind='triangle1' and expired=70000",[ids[0]])).rows;
  assert.equal(capped.length,1);assert.equal(Number(capped[0].paid),20000);
  const beforeRefill=await triangleCounts();
  await buy(0); // no restoration of previously expired 70k
  assert.deepEqual(await triangleCounts(),beforeRefill);
  await db.exec('select private.check_triangles();select private.check_triangles();');
  assert.deepEqual(await triangleCounts(),beforeRefill);
  assert.equal((await db.query<any>(`select count(*)::int n from (select match_id from private.triangle_credits where match_id is not null group by match_id having count(*)<>3 or count(distinct slot)<>3) bad`)).rows[0].n,0);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select private.match_triangles(true)'),/permission denied/);
 } finally { await db.close(); }
});
import { seedDemo, demoCredit } from '../src/lib/demo';
import { demoProducts } from '../src/lib/member-data';
test('demo also repeats matching only after all three purchases',()=>{
 let data=seedDemo();
 const count=()=>data.bonuses.filter(b=>b.member_id==='demo-0' && b.kind==='triangle1').length;
 assert.equal(count(),1);
 data=demoCredit(data,'demo-1','재구매',crypto.randomUUID(),demoProducts[0]);
 data=demoCredit(data,'demo-0','재구매',crypto.randomUUID(),demoProducts[0]);
 assert.equal(count(),1);
 data=demoCredit(data,'demo-2','재구매',crypto.randomUUID(),demoProducts[0]);
 assert.equal(count(),2);
});
