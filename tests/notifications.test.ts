import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("announcements: permissions, recipient snapshot, read ownership, versions and durable push queue", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    const admin = crypto.randomUUID(),
      a = crypto.randomUUID(),
      b = crypto.randomUUID();
    for (const id of [admin, a, b])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        id + "@example.invalid",
        JSON.stringify({
          name: "알림 테스트",
          phone: "010-0000-0000",
          postcode: "00000",
          address: "테스트 주소",
        }),
      ]);
    await db.query("update public.members set role='admin' where id=$1", [
      admin,
    ]);
    async function login(id: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    const id = crypto.randomUUID();
    const save = (push = true, targets = [a], mode = "selected", notice = id) =>
      db.query<{ value: { revision: number } }>(
        "select public.save_announcement($1,'테스트 제목','<script>literal</script>',$2,$3,$4) value",
        [notice, mode, targets, push],
      );
    const publish = (revision: number, notice = id) =>
      db.query<{ n: number }>("select public.publish_announcement($1,$2) n", [
        notice,
        revision,
      ]);
    await login(a);
    await assert.rejects(save());
    await assert.rejects(db.query("select * from public.push_subscriptions"));
    await assert.rejects(db.query("select * from public.claim_push_jobs(5)"));
    await assert.rejects(
      db.query("select public.subscribe_push($1,$2,$3)", [
        "https://127.0.0.1/private",
        "A".repeat(87),
        "B".repeat(22),
      ]),
    );
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-one";
    const sub = (
      await db.query<{ id: string }>(
        "select public.subscribe_push($1,$2,$3) id",
        [endpoint, "A".repeat(87), "B".repeat(22)],
      )
    ).rows[0].id;
    await login(b);
    await assert.rejects(
      db.query("select public.subscribe_push($1,$2,$3)", [
        endpoint,
        "A".repeat(87),
        "B".repeat(22),
      ]),
    );
    await login(admin);
    assert.equal((await save()).rows[0].value.revision, 1);
    await login(a);
    assert.equal(
      (await db.query("select * from public.announcements")).rows.length,
      0,
    );
    await login(admin);
    assert.equal((await save()).rows[0].value.revision, 2);
    await assert.rejects(publish(1), /다른 관리자/);
    assert.equal((await publish(2)).rows[0].n, 1);
    assert.equal((await publish(2)).rows[0].n, 1);
    await assert.rejects(save(), /수정할 수 없습니다/);
    await login(b);
    assert.equal(
      (await db.query("select * from public.announcements")).rows.length,
      0,
    );
    await db.query("select public.read_announcement($1)", [id]);
    await login(a);
    const inbox = async () =>
      (
        await db.query<{
          value: {
            unread: number;
            items: { announcements: { body: string } }[];
          };
        }>("select public.member_announcements(0) value")
      ).rows[0].value;
    assert.equal((await inbox()).unread, 1);
    assert.equal(
      (await inbox()).items[0].announcements.body,
      "<script>literal</script>",
    );
    await db.query("select public.read_announcement($1)", [id]);
    assert.equal((await inbox()).unread, 0);
    await db.exec("reset role;set role service_role");
    const jobs = await db.query<{ id: string; lease_token: string }>(
      "select * from public.claim_push_jobs(5)",
    );
    assert.equal(jobs.rows.length, 1);
    assert.equal(
      (await db.query("select * from public.claim_push_jobs(5)")).rows.length,
      0,
    );
    await db.exec(
      "update public.push_deliveries set locked_at=now()-interval '6 minutes'",
    );
    const reclaimed = await db.query<{ lease_token: string; attempts: number }>(
      "select * from public.claim_push_jobs(5)",
    );
    assert.notEqual(reclaimed.rows[0].lease_token, jobs.rows[0].lease_token);
    assert.equal(reclaimed.rows[0].attempts, 2);
    await login(a);
    await db.query("select public.unsubscribe_push($1)", [sub]);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.push_deliveries",
        )
      ).rows[0].status,
      "cancelled",
    );
    await login(admin);
    const allId = crypto.randomUUID();
    await save(false, [], "all", allId);
    assert.equal((await publish(1, allId)).rows[0].n, 3);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from public.push_deliveries")).rows.length,
      1,
    );
    const later = crypto.randomUUID();
    await db.query("insert into auth.users values($1,$2,$3)", [
      later,
      "later@example.invalid",
      JSON.stringify({
        name: "나중 가입",
        phone: "010-0000-0000",
        postcode: "00000",
        address: "테스트 주소",
      }),
    ]);
    await login(later);
    assert.equal((await inbox()).items.length, 0);
    await db.exec("reset role");
    await db.query("update public.members set status='suspended' where id=$1", [
      a,
    ]);
    await login(a);
    await assert.rejects(inbox());
    assert.equal(
      (await db.query("select * from public.announcements")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
