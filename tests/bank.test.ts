import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { bankFields } from "../src/lib/bank-details";
test("bank details optional at signup, preserve leading zero, private and checked updates", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role service_role bypassrls;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    const files = (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files)
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    const info = {
      name: "테스트",
      phone: "010-0000-0000",
      postcode: "00000",
      address: "테스트 주소",
    };
    const noBank = crypto.randomUUID();
    await db.query("insert into auth.users values($1,$2,$3)", [
      noBank,
      "optional@example.invalid",
      JSON.stringify(info),
    ]);
    assert.equal(
      (
        await db.query<any>(
          "select bank_name from public.members where id=$1",
          [noBank],
        )
      ).rows[0].bank_name,
      null,
    );
    await assert.rejects(
      db.query("insert into auth.users values($1,$2,$3)", [
        crypto.randomUUID(),
        "invalid@example.invalid",
        JSON.stringify({ ...info, bank_name: "신한은행" }),
      ]),
      /계좌번호/,
    );
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    for (const id of [a, b])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        id + "@example.invalid",
        JSON.stringify({
          ...info,
          bank_name: "KB국민은행",
          account_number: "001-234-567890",
          account_holder: "테스트",
        }),
      ]);
    const login = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await login(a);
    let rows = (
      await db.query<any>("select id,account_number from public.members")
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_number, "001234567890");
    await db.query(
      "select public.update_my_bank('신한은행','000123456789','새 예금주')",
    );
    assert.equal(
      (await db.query<any>("select account_holder from public.members")).rows[0]
        .account_holder,
      "새 예금주",
    );
    await assert.rejects(
      db.query(
        "select public.update_my_bank('해외은행','000123456789','예금주')",
      ),
      /계좌 정보/,
    );
    await assert.rejects(
      db.query("select public.update_my_bank('신한은행','12','예금주')"),
      /계좌 정보/,
    );
    await assert.rejects(
      db.query(
        "select public.update_member_with_bank($1,'테스트','010-0000-0000','00000','주소','','active',null,null,null,null,'신한은행','000123456789','예금주')",
        [b],
      ),
      /관리자/,
    );
    await db.exec("reset role");
    await db.query("update public.members set role='admin' where id=$1", [a]);
    await login(a);
    await db.query(
      "select public.update_member_with_bank($1,'테스트','010-0000-0000','00000','주소','','active',null,null,null,null,'토스뱅크','001234567890','관리자 수정')",
      [b],
    );
    assert.equal(
      (
        await db.query<any>(
          "select account_holder from public.members where id=$1",
          [b],
        )
      ).rows[0].account_holder,
      "관리자 수정",
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from public.audits where detail like '%001234567890%'",
        )
      ).rows[0].n,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query(
        "select public.update_my_bank('신한은행','000123456789','예금주')",
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
  assert.equal(
    bankFields.parse({
      bank_name: "신한은행",
      account_number: "001-234-567890",
      account_holder: "홍길동",
    }).account_number,
    "001234567890",
  );
});
