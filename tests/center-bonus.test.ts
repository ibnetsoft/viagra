import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("daily center split: initial/repeat, snapshot, cap exemption, unpaid and permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role service_role bypassrls; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const f of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    const [owner, ref, buyer, admin] = Array.from({ length: 4 }, () =>
      crypto.randomUUID(),
    );
    for (const id of [owner, ref, buyer, admin])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        `${id}@example.com`,
        JSON.stringify({ name: "검증", phone: "010-0000-0000" }),
      ]);
    await db.query("update public.members set role='admin' where id=$1", [
      admin,
    ]);
    await db.query(
      "update public.members set bonus_limit=1500000,bonus_paid=1500000 where id=any($1::uuid[])",
      [[owner, ref]],
    );
    await db.query("update public.members set referrer_id=$1 where id=$2", [
      ref,
      owner,
    ]);
    const center = crypto.randomUUID();
    await db.query(
      "insert into public.centers(id,name,owner_id) values($1,'검증센터',$2)",
      [center, owner],
    );
    await db.query(
      "update public.members set center_id=$1,pv=900000 where id=$2",
      [center, buyer],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      buyer,
    ]);
    const product = (
      await db.query<any>("select id from public.products limit 1")
    ).rows[0].id;
    for (let i = 0; i < 3; i++) {
      const request = crypto.randomUUID();
      await db.query("select public.buy_product($1,$2)", [product, request]);
      await db.query("select public.buy_product($1,$2)", [product, request]);
      if (i === 1)
        await db.query(
          "update public.members set referrer_id=null where id=$1",
          [owner],
        );
    }
    assert.equal(
      (await db.query("select * from private.center_sales")).rows.length,
      3,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.bonuses where kind in ('center','center_referral')",
        )
      ).rows.length,
      0,
    );
    // Move fixtures to a closed day. Production purchases are never rewritten.
    await db.exec(
      "update private.center_sales set day=(now() at time zone 'Asia/Seoul')::date-1; update public.purchases set created_at=now()-interval '1 day';",
    );
    await db.exec(
      "select private.close_due((now() at time zone 'Asia/Seoul')::date-1); select private.close_due((now() at time zone 'Asia/Seoul')::date-1)",
    );
    const rows = (
      await db.query<any>(
        "select kind,paid,expired from public.bonuses where kind in ('center','center_referral') order by kind",
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => [r.kind, Number(r.paid), Number(r.expired)]),
      [
        ["center", 21000, 0],
        ["center_referral", 10000, 0],
      ],
    );
    const unpaid = (
      await db.query<any>("select * from public.center_referral_unpaid")
    ).rows;
    assert.equal(unpaid.length, 1);
    assert.equal(Number(unpaid[0].amount), 4000);
    assert.equal(Number(unpaid[0].sales_pv), 200000);
    for (const id of [owner, ref])
      assert.equal(
        Number(
          (
            await db.query<any>(
              "select bonus_paid from public.members where id=$1",
              [id],
            )
          ).rows[0].bonus_paid,
        ),
        1500000,
      );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      buyer,
    ]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.center_referral_unpaid")).rows
        .length,
      0,
    );
    assert.equal(
      Number(
        (await db.query<any>("select public.my_bonus_total() total")).rows[0]
          .total,
      ),
      0,
    );
    await assert.rejects(db.query("select public.admin_center_stats()"), /관리자/);
    await assert.rejects(db.query("select public.update_center($1,'거부',$2)",[center,buyer]), /관리자/);
    await assert.rejects(
      db.query("select private.settle_centers(current_date-1)"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.center_referral_unpaid")).rows
        .length,
      1,
    );
    const stats=(await db.query<any>("select public.admin_center_stats() stats")).rows[0].stats;
    assert.equal(Number(stats[0].sales_pv),700000);
    await assert.rejects(db.query("select public.update_center($1,'테스트',$2)",[center,admin]),/정상 회원/);
    await db.query("select public.update_center($1,'수정센터',$2)",[center,buyer]);
    assert.equal((await db.query<any>('select name from public.centers where id=$1',[center])).rows[0].name,'수정센터');
    await db.exec('reset role');
    assert.equal((await db.query<any>('select distinct owner_id from private.center_sales')).rows[0].owner_id,owner);
    await db.exec('set role authenticated');
    await assert.rejects(
      db.query("insert into public.center_referral_unpaid default values"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
