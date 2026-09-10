import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { demoOrganization, demoProducts } from "../src/lib/member-data";
import { seedDemo, demoCredit } from "../src/lib/demo";

test("PV order atomicity, retry, capped rewards, authorization and scoped trees", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const [admin, buyer, outsider, child] = Array.from({ length: 4 }, () =>
      crypto.randomUUID(),
    );
    for (const id of [admin, buyer, outsider, child])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        `${id}@example.com`,
        JSON.stringify({
          name: "테스트",
          phone: "010-0000-0000",
          postcode: "04524",
          address: "서울 테스트 주소",
        }),
      ]);
    await db.query(
      "update public.members set role='admin',bonus_limit=20000 where id=$1",
      [admin],
    );
    await db.query(
      "update public.members set referrer_id=$1,sponsor_id=$1,position='L' where id=$2",
      [admin, buyer],
    );
    await db.query(
      "update public.members set referrer_id=$1,sponsor_id=$2,position='R' where id=$3",
      [buyer, admin, child],
    );
    await db.query(
      "insert into public.centers(id,name,owner_id) values($1,'센터',$2)",
      [outsider, admin],
    );
    await db.query("update public.members set center_id=$1 where id=$2", [
      outsider,
      buyer,
    ]);
    const login = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await login(buyer);
    const product = demoProducts[0].id,
      request = crypto.randomUUID();
    const buy = (req = request) =>
      db.query("select public.buy_product($1,$2)", [product, req]);
    await assert.rejects(buy(), /부족/);
    assert.equal(
      (await db.query("select * from public.purchases")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.query("update public.members set pv=300000 where id=$1", [buyer]);
    await login(buyer);
    await buy();
    await buy();
    const row = (
      await db.query<any>("select * from public.members where id=$1", [buyer])
    ).rows[0];
    assert.equal(Number(row.pv), 0);
    assert.equal(Number(row.bonus_limit), 1500000);
    const orders = (await db.query<any>("select * from public.purchases")).rows;
    assert.equal(orders.length, 1);
    assert.equal(orders[0].payment_method, "pv");
    assert.equal(Number(orders[0].cash), 0);
    assert.equal(Number(orders[0].pv_spent), 300000);
    assert.match(orders[0].address, /서울 테스트/);
    await assert.rejects(buy(crypto.randomUUID()), /부족/);
    const org = async (mode: string, root: string) =>
      (
        await db.query<any>("select public.my_organization($1,$2,0) as tree", [
          mode,
          root,
        ])
      ).rows[0].tree;
    const referral = await org("referral", buyer);
    assert.equal(referral.children[0].id, child);
    assert.equal("email" in referral.children[0], false);
    assert.equal("pv" in referral.children[0], false);
    assert.equal((await org("sponsor", buyer)).total, 0);
    await org("referral", child);
    await assert.rejects(org("sponsor", child), /본인 산하/);
    await assert.rejects(org("referral", admin), /본인 산하/);
    await login(outsider);
    await assert.rejects(buy(), /사용된 요청/);
    await login(admin);
    const rewards = (
      await db.query<any>("select * from public.bonuses where member_id=$1", [
        admin,
      ])
    ).rows;
    assert.equal(
      rewards.reduce((n, r) => n + Number(r.paid), 0),
      20000,
    );
    assert.equal(
      rewards.reduce((n, r) => n + Number(r.expired), 0),
      85000,
    );
    await assert.rejects(
      db.query("select public.credit_purchase($1,$2,'cash')", [buyer, request]),
      /사용된 요청/,
    );
    // Repeated PV purchase uses purchase PV (300k), without crediting spendable PV.
    await db.exec("reset role");
    await db.query("update public.members set pv=300000 where id=$1", [buyer]);
    await login(buyer);
    const attempts = await Promise.allSettled([
      buy(crypto.randomUUID()),
      buy(crypto.randomUUID()),
    ]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    await login(admin);
    const rollup = (
      await db.query<any>("select * from public.bonuses where kind='rollup'")
    ).rows[0];
    assert.equal(Number(rollup.gross), 10000);
    assert.equal(Number(rollup.paid), 0);
    await db.exec("reset role");
    await db.query(
      "update public.members set status='suspended',pv=300000 where id=$1",
      [buyer],
    );
    await login(buyer);
    await assert.rejects(buy(crypto.randomUUID()), /로그인/);
    await assert.rejects(org("referral", buyer), /로그인/);
    await db.exec("reset role;set role anon");
    await assert.rejects(buy(), /permission denied/);
  } finally {
    await db.close();
  }
});

test("demo shop spends PV and own organization excludes unrelated members", () => {
  const data = seedDemo(),
    request = crypto.randomUUID();
  const updated = demoCredit(
    data,
    "demo-1",
    "PV 구매",
    request,
    demoProducts[0],
  );
  assert.equal(updated.members[1].pv, 0);
  assert.equal(updated.members[1].bonus_limit, 3000000);
  assert.equal(
    demoCredit(updated, "demo-1", "PV 구매", request, demoProducts[0]).purchases
      .length,
    updated.purchases.length,
  );
  assert.throws(
    () =>
      demoCredit(
        updated,
        "demo-1",
        "PV 구매",
        crypto.randomUUID(),
        demoProducts[0],
      ),
    /부족/,
  );
  assert.throws(
    () => demoOrganization(updated, "demo-1", "sponsor", "demo-2"),
    /본인 산하/,
  );
  const tree = demoOrganization(updated, "demo-1", "sponsor");
  assert.equal(tree.children.length, 2);
  assert.equal("address" in tree.children[0], false);
});
