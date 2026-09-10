import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Postgres integration: authorization, atomic credits, shipping, triangles, caps and daily close", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role service_role bypassrls; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(
      await readFile(
        "supabase/migrations/20260910083004_initial_vital_partners.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20260910103130_member_shop_and_organization.sql",
        "utf8",
      ),
    );
    const ids = Array.from({ length: 18 }, () => crypto.randomUUID());
    for (let i = 0; i < ids.length; i++)
      await db.query(`insert into auth.users values($1,$2,$3)`, [
        ids[i],
        `user${i}@example.com`,
        JSON.stringify({
          name: `회원${i}`,
          phone: "010-0000-0000",
          postcode: "04524",
          address: "서울특별시 중구 세종대로 110",
          address_detail: "101호",
          role: "admin",
        }),
      ]);
    const rows = await db.query<{ role: string }>(
      "select role from public.members",
    );
    assert.ok(
      rows.rows.every((r) => r.role === "member"),
      "user-editable metadata must not elevate role",
    );
    await db.query(`update public.members set role='admin' where id=$1`, [
      ids[0],
    ]);
    const login = async (id: string) => {
      await db.exec("reset role");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await login(ids[1]);
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      1,
      "RLS hides other member addresses",
    );
    await assert.rejects(
      db.query("select public.credit_purchase($1,$2,$3)", [
        ids[1],
        crypto.randomUUID(),
        "입금 확인",
      ]),
      /관리자 권한/,
    );
    await assert.rejects(
      db.query(`update public.members set role='admin' where id=$1`, [ids[1]]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`select private.award($1,'hack','referral',90000)`, [ids[1]]),
      /permission denied/,
    );
    await login(ids[0]);
    const credit = async (id: string, request = crypto.randomUUID()) => {
      await db.query("select public.credit_purchase($1,$2,$3)", [
        id,
        request,
        "입금 확인",
      ]);
      return request;
    };
    const initial = await credit(ids[0]);
    await credit(ids[0], initial);
    let m = (
      await db.query<{ pv: number; bonus_limit: number }>(
        "select pv,bonus_limit from public.members where id=$1",
        [ids[0]],
      )
    ).rows[0];
    assert.equal(Number(m.pv), 300000);
    assert.equal(Number(m.bonus_limit), 1500000);
    await assert.rejects(credit(ids[1], initial), /다른 회원/);
    const edit = async (
      id: string,
      ref: string | null,
      sponsor: string | null,
      pos: string | null,
    ) =>
      db.query(
        `select public.update_member($1,'테스트 회원','010-0000-0000','04524','서울특별시 중구 세종대로 110','202호','active',$2,$3,$4,null)`,
        [id, ref, sponsor, pos],
      );
    await edit(ids[1], ids[0], ids[0], "L");
    await edit(ids[2], ids[1], ids[0], "R"); // Different referral and sponsorship.
    await assert.rejects(edit(ids[3], null, ids[0], "R"), /duplicate key/);
    await assert.rejects(edit(ids[1], ids[2], ids[0], "L"), /순환|첫 충전 후/);
    await credit(ids[1]);
    await credit(ids[2]);
    const bonus = await db.query<{ kind: string; gross: number }>(
      `select kind,gross from public.bonuses where member_id=$1`,
      [ids[0]],
    );
    assert.equal(bonus.rows.filter((b) => b.kind === "triangle1").length, 1);
    assert.deepEqual(
      bonus.rows
        .filter((b) => b.kind === "referral")
        .map((b) => Number(b.gross))
        .sort((a, b) => a - b),
      [30000, 90000],
    );
    await assert.rejects(edit(ids[1], null, ids[0], "L"), /첫 충전 후/);
    await db.query(`select public.update_shipping($1,'delivered','택배 123')`, [
      initial,
    ]);
    assert.equal(
      (
        await db.query<{ shipping_status: string }>(
          "select shipping_status from public.purchases where id=$1",
          [initial],
        )
      ).rows[0].shipping_status,
      "delivered",
    );
    await edit(ids[0], null, null, null);
    assert.match(
      (
        await db.query<{ address: string }>(
          "select address from public.purchases where id=$1",
          [initial],
        )
      ).rows[0].address,
      /101호/,
      "purchase address snapshot is immutable",
    );
    await db.exec("reset role");
    await db.query("update public.members set bonus_paid=1480000 where id=$1", [
      ids[0],
    ]);
    await db.query(`select private.award($1,'edge','triangle3',90000)`, [
      ids[0],
    ]);
    await db.query(`select private.award($1,'stopped','referral',90000)`, [
      ids[0],
    ]);
    let edge = (
      await db.query<{ paid: number; expired: number }>(
        `select paid,expired from public.bonuses where event_key='edge'`,
      )
    ).rows[0];
    assert.equal(Number(edge.paid), 20000);
    assert.equal(Number(edge.expired), 70000);
    assert.equal(
      Number(
        (
          await db.query<{ paid: number }>(
            `select paid from public.bonuses where event_key='stopped'`,
          )
        ).rows[0].paid,
      ),
      0,
    );
    await login(ids[0]);
    await credit(ids[0]);
    m = (
      await db.query<{ pv: number; bonus_limit: number }>(
        "select pv,bonus_limit from public.members where id=$1",
        [ids[0]],
      )
    ).rows[0];
    assert.equal(Number(m.pv), 500000);
    assert.equal(Number(m.bonus_limit), 3000000);
    await db.exec("reset role");
    await db.query(`select private.award($1,'edge','triangle3',90000)`, [
      ids[0],
    ]);
    edge = (
      await db.query<{ paid: number; expired: number }>(
        `select paid,expired from public.bonuses where event_key='edge'`,
      )
    ).rows[0];
    assert.equal(
      Number(edge.paid),
      20000,
      "repurchase never replays expired events",
    );
    await db.query(
      `select private.award($1,'after-repurchase','referral',90000)`,
      [ids[0]],
    );
    assert.equal(
      Number(
        (
          await db.query<{ paid: number }>(
            `select paid from public.bonuses where event_key='after-repurchase'`,
          )
        ).rows[0].paid,
      ),
      90000,
    );
    // Expand to a full three-level binary organization.
    await login(ids[0]);
    for (let i = 3; i < 7; i++) {
      await edit(
        ids[i],
        ids[0],
        ids[Math.floor((i - 1) / 2)],
        i % 2 ? "L" : "R",
      );
      await credit(ids[i]);
    }
    const second = await db.query(
      `select * from public.bonuses where member_id=$1 and kind='triangle2'`,
      [ids[0]],
    );
    assert.equal(second.rows.length, 2);
    for (let i = 7; i < 15; i++) {
      await edit(
        ids[i],
        ids[0],
        ids[Math.floor((i - 1) / 2)],
        i % 2 ? "L" : "R",
      );
      await credit(ids[i]);
    }
    assert.equal(
      (
        await db.query(
          `select * from public.bonuses where member_id=$1 and kind='triangle3' and event_key like 'triangle3:%'`,
          [ids[0]],
        )
      ).rows.length,
      4,
    );
    // Financial writes fully roll back when an invalid reference fails.
    const count = (await db.query(`select * from public.purchases`)).rows
      .length;
    await assert.rejects(credit(crypto.randomUUID()), /충전할 수 없는/);
    assert.equal(
      (await db.query(`select * from public.purchases`)).rows.length,
      count,
    );
    // Daily close is executable and idempotent.
    await db.exec("reset role");
    await db.exec(
      `update public.purchases set created_at=now()-interval '1 day' where kind='repeat'`,
    );
    await login(ids[0]);
    await db.exec(
      `select public.close_day(((now() at time zone 'Asia/Seoul')::date-1))`,
    );
    const daily = (
      await db.query(`select * from public.bonuses where kind='team'`)
    ).rows.length;
    assert.equal(daily, 1);
    await db.exec(
      `select public.close_day(((now() at time zone 'Asia/Seoul')::date-1))`,
    );
    assert.equal(
      (await db.query(`select * from public.bonuses where kind='team'`)).rows
        .length,
      daily,
    );
    await assert.rejects(
      db.exec(
        `select public.close_day((now() at time zone 'Asia/Seoul')::date)`,
      ),
      /마감된 날짜/,
    );
    // A center is an explicitly assigned group, independent from the sponsor tree.
    await credit(ids[16]);
    await db.query(`select public.create_center('테스트 센터',$1)`, [ids[16]]);
    const center = (
      await db.query<{ id: string }>(
        `select id from public.centers where name='테스트 센터'`,
      )
    ).rows[0].id;
    await db.query(
      `select public.update_member($1,'센터 소속 회원','010-0000-0000','04524','서울 중구','101호','active',null,null,null,$2)`,
      [ids[17], center],
    );
    await credit(ids[17]);
    await credit(ids[17]);
    const centerBonuses = (
      await db.query<{ gross: number }>(
        `select gross from public.bonuses where member_id=$1 and kind='center' order by gross`,
        [ids[16]],
      )
    ).rows.map((b) => Number(b.gross));
    assert.deepEqual(
      centerBonuses,
      [10000, 15000],
      "center rewards use PV, not cash sales",
    );
    await login(ids[16]);
    assert.equal(
      (await db.query<{ my_grade: string }>("select public.my_grade()")).rows[0]
        .my_grade,
      "센터",
    );
    assert.equal(
      (await db.query("select * from public.centers")).rows.length,
      1,
      "center owner can read their center grade",
    );
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      1,
      "center grade does not grant admin access",
    );
    await login(ids[1]);
    await assert.rejects(
      db.query(`select public.update_shipping($1,'delivered','')`, [initial]),
      /관리자 권한/,
    );
    assert.equal(
      (await db.query(`select * from public.audits`)).rows.length,
      0,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query(`select public.credit_purchase($1,$2,'입금')`, [
        ids[1],
        crypto.randomUUID(),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
