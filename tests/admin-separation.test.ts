import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seedDemo } from "../src/lib/demo";
import { demoOrganization } from "../src/lib/member-data";
test("administrator remains an operator, excluded from network, centers, purchases and rewards", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const f of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    const [admin, member, child] = Array.from({ length: 3 }, () =>
      crypto.randomUUID(),
    );
    for (const id of [admin, member, child])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        id + "@example.invalid",
        JSON.stringify({
          name: "구분 테스트",
          phone: "010-0000-0000",
          postcode: "00000",
          address: "테스트 주소",
        }),
      ]);
    await db.query(
      "update public.members set role='admin',pv=300000,bonus_limit=1500000 where id=$1",
      [admin],
    );
    await assert.rejects(
      db.query("update public.members set referrer_id=$1 where id=$2", [
        admin,
        member,
      ]),
      /관리자/,
    );
    await assert.rejects(
      db.query(
        "update public.members set sponsor_id=$1,position='L' where id=$2",
        [admin, member],
      ),
      /관리자/,
    );
    await assert.rejects(
      db.query("update public.members set referrer_id=$1 where id=$2", [
        member,
        admin,
      ]),
      /관리자/,
    );
    const login = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await login(admin);
    await assert.rejects(
      db.query("select public.my_organization('sponsor',null,0)"),
      /로그인/,
    );
    await assert.rejects(
      db.query("select public.create_center('관리자 센터',$1)", [admin]),
      /관리자/,
    );
    await assert.rejects(
      db.query("select public.credit_purchase($1,$2,'입금 확인')", [
        admin,
        crypto.randomUUID(),
      ]),
      /관리자/,
    );
    await assert.rejects(
      db.query(
        "select public.buy_product('caa14000-0000-4000-8000-000000000001',$1)",
        [crypto.randomUUID()],
      ),
      /관리자/,
    );
    await db.query("select public.create_center('회원 센터',$1)", [member]);
    await db.query("select public.credit_purchase($1,$2,'회원 입금 확인')", [
      member,
      crypto.randomUUID(),
    ]);
    await db.exec("reset role");
    await db.query("select private.award($1,'admin-test','referral',90000)", [
      admin,
    ]);
    assert.equal(
      (
        await db.query("select * from public.bonuses where member_id=$1", [
          admin,
        ])
      ).rows.length,
      0,
    );
    await db.query(
      "update public.members set referrer_id=$1,sponsor_id=$1,position='L' where id=$2",
      [member, child],
    );
    await login(member);
    for (const mode of ["referral", "sponsor"]) {
      const result = (
        await db.query<{
          value: { total: number; children: { id: string }[] };
        }>("select public.my_organization($1,null,0) value", [mode])
      ).rows[0].value;
      assert.equal(result.total, 1);
      assert.equal(result.children[0].id, child);
      await assert.rejects(
        db.query("select public.my_organization($1,$2,0)", [mode, admin]),
        /본인 산하/,
      );
    }
    const demo = seedDemo();
    assert.throws(
      () => demoOrganization(demo, "demo-admin", "sponsor"),
      /회원만/,
    );
    assert.ok(!demo.purchases.some((p) => p.member_id === "demo-admin"));
  } finally {
    await db.close();
  }
});
