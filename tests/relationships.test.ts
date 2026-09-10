import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("admin moves a purchased branch, preserving old rewards and enforcing cycles and seats", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    for (const id of ids)
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        id + "@example.invalid",
        JSON.stringify({
          name: "회원",
          phone: "010-0000-0000",
          postcode: "00000",
          address: "테스트 주소",
        }),
      ]);
    await db.query("update public.members set role='admin' where id=$1", [
      ids[0],
    ]);
    await db.query(
      "update public.members set referrer_id=$1,sponsor_id=$1,position='L' where id=$2",
      [ids[1], ids[2]],
    );
    await db.query(
      "update public.members set referrer_id=$1,sponsor_id=$1,position='L' where id=$2",
      [ids[2], ids[3]],
    );
    await db.query(
      "update public.members set sponsor_id=$1,position='R' where id=$2",
      [ids[1], ids[5]],
    );
    const login = async (i: number) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids[i],
      ]);
      await db.exec("set role authenticated");
    };
    const edit = (
      i: number,
      ref: number | null,
      sponsor: number | null,
      pos: string | null,
    ) =>
      db.query(
        "select public.update_member_with_bank($1,'회원','010-0000-0000','00000','테스트 주소','','active',$2,$3,$4,null,null,null,null)",
        [
          ids[i],
          ref === null ? null : ids[ref],
          sponsor === null ? null : ids[sponsor],
          pos,
        ],
      );
    await login(0);
    await db.query("select public.credit_purchase($1,$2,'입금')", [
      ids[2],
      crypto.randomUUID(),
    ]);
    await login(2);
    await db.query("select public.buy_product($1,$2)", [
      "caa14000-0000-4000-8000-000000000001",
      crypto.randomUUID(),
    ]);
    await assert.rejects(edit(2, 4, 4, "L"), /관리자/);
    await login(0);
    const before = (await db.query("select * from public.bonuses order by id"))
      .rows;
    await edit(2, 4, 4, "L");
    const branch = (
      await db.query<any>(
        "select sponsor_id,referrer_id from public.members where id=$1",
        [ids[2]],
      )
    ).rows[0];
    assert.equal(branch.sponsor_id, ids[4]);
    assert.equal(branch.referrer_id, ids[4]);
    assert.equal(
      (
        await db.query<any>(
          "select sponsor_id from public.members where id=$1",
          [ids[3]],
        )
      ).rows[0].sponsor_id,
      ids[2],
    );
    assert.deepEqual(
      (await db.query("select * from public.bonuses order by id")).rows,
      before,
    );
    const audit = (
      await db.query<any>(
        "select detail from public.audits where action='추천·후원 변경'",
      )
    ).rows;
    assert.equal(audit.length, 1);
    assert.equal(JSON.parse(audit[0].detail).before.sponsor, ids[1]);
    await assert.rejects(edit(2, 3, 4, "L"), /순환/);
    await assert.rejects(edit(4, null, 3, "R"), /순환/);
    await assert.rejects(edit(2, 4, 1, "R"), /duplicate key/);
    await assert.rejects(edit(2, 2, 4, "L"), /순환/);
    for (let i = 0; i < 2; i++)
      await db.query("select public.credit_purchase($1,$2,'추가 입금')", [
        ids[2],
        crypto.randomUUID(),
      ]);
    const order = crypto.randomUUID();
    await login(2);
    await db.query("select public.buy_product($1,$2)", [
      "caa14000-0000-4000-8000-000000000001",
      order,
    ]);
    await login(0);
    const newRewards = (
      await db.query<any>(
        "select member_id,gross from public.bonuses where event_key=$1",
        [order + ":rollup"],
      )
    ).rows;
    assert.equal(newRewards.length, 1);
    assert.equal(newRewards[0].member_id, ids[4]);
    assert.equal(Number(newRewards[0].gross), 10000);
  } finally {
    await db.close();
  }
});
