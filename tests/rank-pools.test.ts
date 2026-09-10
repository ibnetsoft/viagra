import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("head shares the team pool once and separately receives the head pool", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role service_role bypassrls;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const ids = Array.from({ length: 21 }, () => crypto.randomUUID());
    for (const id of ids)
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        `${id}@example.com`,
        JSON.stringify({
          bank_name: "KB국민은행",
          account_number: "000000000000",
          account_holder: "테스트 회원",
          name: "회원",
          phone: "010-0000-0000",
          postcode: "04524",
          address: "서울 테스트",
        }),
      ]);
    await db.exec("update public.members set bonus_limit=1500000");
    // The head has only three referrals: union must include it even without five direct agents.
    for (let team = 1; team <= 3; team++) {
      await db.query("update public.members set referrer_id=$1 where id=$2", [
        ids[0],
        ids[team],
      ]);
      for (let child = 0; child < 5; child++)
        await db.query("update public.members set referrer_id=$1 where id=$2", [
          ids[team],
          ids[4 + (team - 1) * 5 + child],
        ]);
    }
    await db.query(
      "insert into public.purchases(id,member_id,kind,cash,pv,cap_added,recipient,phone,address,note,created_by,created_at,payment_method,pv_spent,product_id) values($1,$2,'repeat',0,200000,1500000,'회원','010-0000-0000','서울','테스트',$2,now()-interval '1 day','pv',200000,'caa14000-0000-4000-8000-000000000001')",
      [crypto.randomUUID(), ids[20]],
    );
    const close = () =>
      db.exec(
        "select private.close_day((now() at time zone 'Asia/Seoul')::date-1)",
      );
    await close();
    await close();
    let rows = (
      await db.query<{ member_id: string; kind: string; paid: number }>(
        "select member_id,kind,paid from public.bonuses",
      )
    ).rows;
    assert.equal(rows.filter((r) => r.kind === "team").length, 4);
    assert.equal(rows.filter((r) => r.kind === "head").length, 1);
    assert.equal(
      Number(
        rows.find((r) => r.member_id === ids[0] && r.kind === "team")?.paid,
      ),
      10000,
    );
    assert.equal(
      Number(
        rows.find((r) => r.member_id === ids[0] && r.kind === "head")?.paid,
      ),
      20000,
    );
    // Qualifying for both ranks still counts the head only once in the lower pool.
    for (const id of ids.slice(19))
      await db.query("update public.members set referrer_id=$1 where id=$2", [
        ids[0],
        id,
      ]);
    await db.exec(
      "delete from public.bonuses;delete from private.daily_closes;update public.members set bonus_paid=0",
    );
    await close();
    rows = (await db.query("select member_id,kind,paid from public.bonuses"))
      .rows as typeof rows;
    assert.equal(rows.filter((r) => r.kind === "team").length, 4);
    assert.equal(rows.filter((r) => r.member_id === ids[0]).length, 2);
  } finally {
    await db.close();
  }
});
