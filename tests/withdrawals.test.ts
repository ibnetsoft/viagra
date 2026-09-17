import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

test("withdrawals reserve paid bonuses and admin approves once", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role service_role bypassrls;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  const login = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const member = crypto.randomUUID();
  const admin = crypto.randomUUID();
  await db.query("insert into auth.users values($1,$2,$3)", [member, "m@example.invalid", JSON.stringify({ name: "회원", phone: "010-1111-2222" })]);
  await db.query("insert into auth.users values($1,$2,$3)", [admin, "a@example.invalid", JSON.stringify({ name: "관리자", phone: "010-3333-4444" })]);
  await db.query("update public.members set role='admin' where id=$1", [admin]);
  await db.query("update public.members set bank_name='신한은행',account_number='000123456789',account_holder='회원' where id=$1", [member]);
  await db.query("insert into public.bonuses(member_id,event_key,kind,gross,paid,expired,reason) values($1,'w1','referral',100000,100000,0,'')", [member]);

  await login(member);
  await db.query("select public.request_withdrawal(70000,'첫 신청')");
  await assert.rejects(() => db.query("select public.request_withdrawal(40000,'초과 신청')"), /출금 가능액이 부족합니다/);
  let rows = (await db.query<any>("select amount,status from public.withdrawals where member_id=$1", [member])).rows;
  assert.deepEqual(rows.map((r) => [Number(r.amount), r.status]), [[70000, "pending"]]);

  await login(admin);
  const id = (await db.query<any>("select id from public.withdrawals limit 1")).rows[0].id;
  await db.query("select public.process_withdrawal($1,'approved','송금 완료')", [id]);
  await assert.rejects(() => db.query("select public.process_withdrawal($1,'rejected','중복')", [id]), /이미 처리/);
  rows = (await db.query<any>("select status,admin_note,processed_by is not null processed from public.withdrawals where id=$1", [id])).rows;
  assert.deepEqual(rows[0], { status: "approved", admin_note: "송금 완료", processed: true });
});
