const reportLabels: Record<string, string> = {
  members: "회원",
  pv_topups: "PV 충전",
  purchases: "상품 주문",
  bonuses: "보너스 원장",
  centers: "센터",
  audits: "작업 기록",
  record: "기록 종류",
  count: "건수",
  kind: "보너스 종류",
  gross: "발생액",
  paid: "지급액",
  expired: "소멸액",
  member_code: "회원번호",
  grade: "직급",
  generation: "후원 대수",
  name: "이름 / 검증 항목",
  passed: "통과 여부",
  actual: "실제 결과",
  expected: "예상 결과",
  true: "통과",
  false: "실패",
  center: "센터 보너스",
  head: "본부장 배분",
  referral: "추천 보너스",
  rollup: "후원 롤업",
  team: "팀장 배분",
  test_fixture: "한도 검증 준비 기록",
  triangle1: "삼각 1",
  triangle2: "삼각 2",
  triangle3: "삼각 3",
  cash: "입금액",
  pv: "PV",
  pv_spent: "사용 PV",
  bonus_limit: "총 한도",
  bonus_paid: "누적 지급",
  role: "권한",
  status: "상태",
  created_at: "기록 시각",
  note: "메모",
  action: "작업",
  actor: "처리자",
  detail: "내용",
  shipping_status: "배송 상태",
  cap_added: "추가 한도",
  payment_method: "결제 방식",
  product_name: "상품명",
};
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Each run has a new durable directory. No records or previous runs are deleted.
async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve("validation-runs", runId);
  await mkdir(dir, { recursive: true });
  const db = new PGlite(path.join(dir, "database"));
  const checks: {
    name: string;
    passed: boolean;
    actual: unknown;
    expected: unknown;
  }[] = [];
  const ids: string[] = [];
  const purchaseIds = new Map<number, string>();
  const product = "caa14000-0000-4000-8000-000000000001";
  let failure = "";
  let ancestorRows: any[] = [];
  let grades: any[] = [];
  const eq = (name: string, actual: unknown, expected: unknown) => {
    checks.push({
      name,
      actual,
      expected,
      passed: JSON.stringify(actual) === JSON.stringify(expected),
    });
    assert.deepEqual(actual, expected, name);
  };
  const q = async (sql: string, args: any[] = []) =>
    (await db.query<any>(sql, args)).rows;
  const login = async (id: string) => {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const topup = async (i: number, request = crypto.randomUUID()) => {
    await login(ids[31]);
    await q("select public.credit_purchase($1,$2,'보관 테스트 입금 확인')", [
      ids[i],
      request,
    ]);
    return request;
  };
  const buy = async (i: number, request = crypto.randomUUID()) => {
    await login(ids[i]);
    await q("select public.buy_product($1,$2)", [product, request]);
    return request;
  };
  const member = async (i: number) => {
    await db.exec("reset role");
    return (await q("select * from public.members where id=$1", [ids[i]]))[0];
  };
  const counts = async () => {
    await db.exec("reset role");
    return (
      await q(
        "select (select count(*) from public.purchases)::int as orders,(select count(*) from public.bonuses)::int as bonuses",
      )
    )[0];
  };
  const create = async (
    i: number,
    ref: number | null = null,
    sponsor: number | null = null,
    position: string | null = null,
  ) => {
    await db.exec("reset role");
    ids[i] = crypto.randomUUID();
    const name =
      i === 0
        ? "검증_본부장"
        : i >= 1 && i <= 3
          ? `검증_팀장${i}`
          : i === 30
            ? "검증_센터장"
            : i === 31
              ? "검증_관리자"
              : i === 32
                ? "검증_한도회원"
                : `검증_회원${String(i).padStart(2, "0")}`;
    await q("insert into auth.users values($1,$2,$3)", [
      ids[i],
      `scenario-${runId}-${i}@example.invalid`,
      JSON.stringify({
        name,
        phone: "010-0000-0000",
        postcode: "00000",
        address: "테스트 전용 · 실제 배송 금지",
      }),
    ]);
    await q(
      "update public.members set member_code=$2,referrer_id=$3,sponsor_id=$4,position=$5 where id=$1",
      [
        ids[i],
        `TEST${String(i).padStart(3, "0")}`,
        ref === null ? null : ids[ref],
        sponsor === null ? null : ids[sponsor],
        position,
      ],
    );
  };
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        await readFile(path.join("supabase/migrations", file), "utf8"),
      );
    // Four full binary levels, then fifteen more sponsor generations under node 7.
    for (let i = 0; i < 36; i++) {
      const ref =
        i >= 1 && i <= 3
          ? 0
          : i >= 4 && i <= 18
            ? 1 + Math.floor((i - 4) / 5)
            : i >= 19 && i <= 29
              ? i - 1
              : i === 33 || i === 34
                ? 32
                : null;
      const sponsor =
        i > 0 && i < 15
          ? Math.floor((i - 1) / 2)
          : i === 15
            ? 7
            : i > 15 && i <= 29
              ? i - 1
              : i === 33 || i === 34
                ? 32
                : null;
      const position =
        sponsor === null
          ? null
          : i === 34
            ? "R"
            : i >= 15
              ? "L"
              : i % 2
                ? "L"
                : "R";
      await create(i, ref, sponsor, position);
    }
    await q("update public.members set role='admin' where id=$1", [ids[31]]);
    await login(ids[31]);
    await q("select public.create_center('보관 검증 센터',$1)", [ids[30]]);
    await db.exec("reset role");
    await q(
      "update public.members set center_id=(select id from public.centers where name='보관 검증 센터') where id<>$1",
      [ids[31]],
    );
    const firstTopup = await topup(30);
    await topup(30, firstTopup);
    eq(
      "충전 요청 재시도: PV 한 번만 증가",
      Number((await member(30)).pv),
      300000,
    );
    eq(
      "충전은 한도를 추가하지 않음",
      Number((await member(30)).bonus_limit),
      0,
    );
    eq("충전은 주문·보너스를 생성하지 않음", await counts(), {
      orders: 0,
      bonuses: 0,
    });
    await buy(30);
    for (let i = 0; i < 36; i++) {
      if (i === 30 || i === 31) continue;
      await topup(i);
      purchaseIds.set(i, await buy(i));
    }
    await db.exec("reset role");
    const depth = Number(
      (
        await q(
          `with recursive tree as(select id,0 depth from public.members where id=$1 union all select m.id,t.depth+1 from public.members m join tree t on m.sponsor_id=t.id) select max(depth) depth from tree`,
          [ids[0]],
        )
      )[0].depth,
    );
    eq("후원 조직 깊이: 루트 아래 18대", depth, 18);
    const triangles = await q(
      "select kind,count(*)::int count,sum(gross)::int gross from public.bonuses where member_id=$1 and kind like 'triangle%' group by kind order by kind",
      [ids[0]],
    );
    eq("최상위 삼각 1·2·3 완성", triangles, [
      { kind: "triangle1", count: 1, gross: 90000 },
      { kind: "triangle2", count: 2, gross: 180000 },
      { kind: "triangle3", count: 4, gross: 240000 },
    ]);
    // Replenish the head's capacity through a real product purchase, not a balance edit.
    await topup(0);
    await topup(0);
    await buy(0);
    const prior = await counts();
    await topup(29);
    await topup(29);
    eq("추가 충전도 주문·보너스 생성 없음", await counts(), prior);
    const repeat = await buy(29);
    await buy(29, repeat);
    eq("재구매 후 PV 잔액", Number((await member(29)).pv), 100000);
    eq(
      "재구매 한도는 한 번만 추가",
      Number((await member(29)).bonus_limit),
      3000000,
    );
    await db.exec("reset role");
    const rollups = await q(
      "select member_id,gross::int,paid::int from public.bonuses where event_key=$1 order by member_id",
      [repeat + ":rollup"],
    );
    eq("롤업은 정확히 13명", rollups.length, 13);
    eq(
      "롤업 13대 각각 10,000원",
      rollups.every((r) => r.gross === 10000 && r.paid === 10000),
      true,
    );
    let ancestor = 28;
    for (let generation = 1; generation <= 18; generation++) {
      const bonus = rollups.find((r) => r.member_id === ids[ancestor]);
      ancestorRows.push({
        generation,
        member_code: `TEST${String(ancestor).padStart(3, "0")}`,
        gross: bonus?.gross ?? 0,
        paid: bonus?.paid ?? 0,
      });
      ancestor =
        ancestor > 15
          ? ancestor - 1
          : ancestor === 15
            ? 7
            : Math.floor((ancestor - 1) / 2);
    }
    eq(
      "14~18대 롤업 없음",
      ancestorRows.slice(13).every((r) => r.gross === 0),
      true,
    );
    eq(
      "재구매 시 삼각 중복 지급 없음",
      (
        await q(
          "select count(*)::int n from public.bonuses where member_id=$1 and kind like 'triangle%'",
          [ids[0]],
        )
      )[0].n,
      7,
    );
    // Fixture clock: settle one designated purchase as yesterday; record the adjustment.
    await q(
      "update public.purchases set created_at=now()-interval '1 day' where id=$1",
      [repeat],
    );
    await q(
      "insert into public.audits(action,actor,detail) values('테스트 시각 설정','검증 실행기',$1)",
      [repeat + " 주문을 전일로 설정하여 일일 마감 검증"],
    );
    await login(ids[31]);
    await q(
      "select public.close_day((now() at time zone 'Asia/Seoul')::date-1)",
    );
    await db.exec("reset role");
    let daily = await q(
      "select member_id,kind,gross::int,paid::int from public.bonuses where kind in ('team','head')",
    );
    eq(
      "팀장 배분 참여자 4명 (팀장3 + 본부장1)",
      daily.filter((r) => r.kind === "team").length,
      4,
    );
    eq(
      "본부장 팀장 배분 수령",
      daily.find((r) => r.member_id === ids[0] && r.kind === "team")?.paid,
      15000,
    );
    eq(
      "본부장 전용 배분 별도 수령",
      daily.find((r) => r.member_id === ids[0] && r.kind === "head")?.paid,
      30000,
    );
    await login(ids[31]);
    await q(
      "select public.close_day((now() at time zone 'Asia/Seoul')::date-1)",
    );
    await db.exec("reset role");
    eq(
      "일일 마감 재실행 중복 없음",
      (
        await q(
          "select count(*)::int n from public.bonuses where kind in ('team','head')",
        )
      )[0].n,
      5,
    );
    // Explicit fixture award sets a 20,000 remaining cap without erasing any ledger entries.
    const cap = await member(32);
    await q(
      "select private.award($1,'test:cap-setup','test_fixture',$2::bigint)",
      [ids[32], 1480000 - Number(cap.bonus_paid)],
    );
    await q(
      "insert into public.audits(action,actor,detail) values('테스트 한도 준비','검증 실행기','TEST032 남은 한도 20,000원 상태를 test_fixture 원장으로 구성')",
    );
    for (let i = 36; i <= 37; i++) {
      await create(i, 32);
      await topup(i);
      purchaseIds.set(i, await buy(i));
    }
    await db.exec("reset role");
    const partial = (
      await q(
        "select gross::int,paid::int,expired::int from public.bonuses where member_id=$1 and event_key=$2",
        [ids[32], purchaseIds.get(36) + ":referral"],
      )
    )[0];
    eq("잔여 2만원 / 발생 9만원 → 지급2만·소멸7만", partial, {
      gross: 90000,
      paid: 20000,
      expired: 70000,
    });
    const stopped = (
      await q(
        "select paid::int,expired::int from public.bonuses where member_id=$1 and event_key=$2",
        [ids[32], purchaseIds.get(37) + ":referral"],
      )
    )[0];
    eq("한도 정지 중 발생분 전액 소멸", stopped, { paid: 0, expired: 90000 });
    await topup(32);
    await topup(32);
    eq(
      "충전만으로 한도 부활 없음",
      Number((await member(32)).bonus_limit),
      1500000,
    );
    await buy(32);
    await create(38, 32);
    await topup(38);
    const fresh = await buy(38);
    await db.exec("reset role");
    eq(
      "재구매 뒤 새 추천 보너스만 지급",
      (
        await q(
          "select paid::int from public.bonuses where member_id=$1 and event_key=$2",
          [ids[32], fresh + ":referral"],
        )
      )[0].paid,
      90000,
    );
    eq(
      "과거 소멸 보너스 부활 없음",
      (
        await q(
          "select paid::int from public.bonuses where member_id=$1 and event_key=$2",
          [ids[32], purchaseIds.get(37) + ":referral"],
        )
      )[0].paid,
      0,
    );
    await q("update public.members set status='suspended' where id=$1", [
      ids[35],
    ]);
    await create(39, 35);
    await topup(39);
    const suspendedEvent = await buy(39);
    await db.exec("reset role");
    eq(
      "계정 정지 보너스 지급 없음",
      (
        await q(
          "select paid::int from public.bonuses where member_id=$1 and event_key=$2",
          [ids[35], suspendedEvent + ":referral"],
        )
      )[0].paid,
      0,
    );
    await login(ids[1]);
    let rejected = false;
    try {
      await q("select public.credit_purchase($1,$2,'권한 검증')", [
        ids[1],
        crypto.randomUUID(),
      ]);
    } catch {
      rejected = true;
    }
    eq("일반 회원 충전 권한 차단", rejected, true);
    eq(
      "RLS: 본인 충전 기록만 조회",
      (await q("select member_id from public.pv_topups")).every(
        (r) => r.member_id === ids[1],
      ),
      true,
    );
    for (const i of [0, 1, 2, 3, 30, 29]) {
      await login(ids[i]);
      grades.push({
        member_code: `TEST${String(i).padStart(3, "0")}`,
        grade: (await q("select public.my_grade() grade"))[0].grade,
      });
    }
    eq(
      "모든 직급 등장",
      [...new Set(grades.map((r) => r.grade))].sort(),
      ["본부장", "센터", "에이전트", "팀장"].sort(),
    );
    await db.exec("reset role");
    const types = (
      await q(
        "select distinct kind from public.bonuses where kind<>'test_fixture' order by kind",
      )
    ).map((r) => r.kind);
    eq("모든 보너스 종류 발생", types, [
      "center",
      "head",
      "referral",
      "rollup",
      "team",
      "triangle1",
      "triangle2",
      "triangle3",
    ]);
    eq(
      "보너스 원장 합계와 회원 지급액 일치",
      (
        await q(
          "select count(*)::int n from public.members m where bonus_paid<>(select coalesce(sum(paid),0) from public.bonuses b where b.member_id=m.id)",
        )
      )[0].n,
      0,
    );
    eq(
      "PV 잔액 = 충전 − 상품 구매",
      (
        await q(
          "select count(*)::int n from public.members m where pv<>(select coalesce(sum(pv),0) from public.pv_topups t where t.member_id=m.id)-(select coalesce(sum(pv_spent),0) from public.purchases p where p.member_id=m.id)",
        )
      )[0].n,
      0,
    );
    eq(
      "한도 = 상품 구매 건수 × 150만원",
      (
        await q(
          "select count(*)::int n from public.members m where bonus_limit<>(select count(*)*1500000 from public.purchases p where p.member_id=m.id)",
        )
      )[0].n,
      0,
    );
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
    console.error(failure);
  } finally {
    await db.exec("reset role");
    const tables: Record<string, any[]> = {};
    for (const table of [
      "members",
      "pv_topups",
      "purchases",
      "bonuses",
      "centers",
      "audits",
    ]) {
      tables[table] = await q(`select * from public.${table}`);
      const rows = tables[table],
        keys = Object.keys(rows[0] ?? {});
      const cell = (v: any) =>
        '"' + String(v ?? "").replaceAll('"', '""') + '"';
      await writeFile(
        path.join(dir, table + ".csv"),
        "\ufeff" +
          [
            keys.map(cell).join(","),
            ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
          ].join("\r\n"),
      );
    }
    const totals = await q(
      "select kind,count(*)::int count,sum(gross)::bigint gross,sum(paid)::bigint paid,sum(expired)::bigint expired from public.bonuses group by kind order by kind",
    );
    const summary = {
      runId,
      database: "별도 보관 DB (실제 운영 데이터와 분리)",
      failure,
      checks,
      grades,
      ancestors: ancestorRows,
      totals,
      counts: Object.fromEntries(
        Object.entries(tables).map(([k, v]) => [k, v.length]),
      ),
    };
    await writeFile(
      path.join(dir, "result.json"),
      JSON.stringify(summary, null, 2),
    );
    const md = `# 보너스 종합 검증 결과\n\n- 실행: ${runId}\n- 결과: ${failure ? "실패: " + failure : "전체 통과"} (${checks.filter((c) => c.passed).length}/${checks.length})\n- 보관: 독립 PostgreSQL 호환 PGlite DB. 운영 회원·보너스에 영향 없음. 기록 삭제 없음.\n- 충전은 PV만 증가, 상품 구매만 한도·주문·보너스 발생.\n- 후원 깊이 18대, 모든 직급과 8가지 보너스 검증.\n\n## 기록 수\n\n${Object.entries(
      summary.counts,
    )
      .map(([k, v]) => "- " + k + ": " + v)
      .join(
        "\n",
      )}\n\n## 보너스 원장\n\n|종류|건수|발생|지급|소멸|\n|---|---:|---:|---:|---:|\n${totals.map((r) => `|${r.kind}|${r.count}|${r.gross}|${r.paid}|${r.expired}|`).join("\n")}\n\ntest_fixture는 잔여 한도 2만원 시나리오를 만들기 위한 명시적 준비 원장으로, 실제 보너스 실적과 구분합니다. 일일 정산을 위해 특정 주문의 시각을 전일로 설정했으며 작업 기록을 남겼습니다.\n\n## 검증 항목\n\n${checks.map((c) => `- ${c.passed ? "통과" : "실패"}: ${c.name} (결과 ${JSON.stringify(c.actual)})`).join("\n")}\n\n## 파일\n\n- database/: 재개 가능한 전체 DB\n- result.json: 예상값과 실제값\n- members.csv, pv_topups.csv, purchases.csv, bonuses.csv, centers.csv, audits.csv: 전체 원본 기록\n`;
    await writeFile(path.join(dir, "결과보고서.md"), md);
    const esc = (v: any) =>
      String(reportLabels[String(v)] ?? v)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const table = (rows: any[]) => {
      const keys = Object.keys(rows[0] ?? {});
      return (
        '<div class="scroll"><table><thead><tr>' +
        keys.map((k) => "<th>" + esc(k) + "</th>").join("") +
        "</tr></thead><tbody>" +
        rows
          .map(
            (r) =>
              "<tr>" +
              keys
                .map(
                  (k) =>
                    "<td>" +
                    esc(
                      typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k],
                    ) +
                    "</td>",
                )
                .join("") +
              "</tr>",
          )
          .join("") +
        "</tbody></table></div>"
      );
    };
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보너스 검증 기록</title><style>body{font-family:system-ui,sans-serif;background:#f3f6f0;color:#193e34;margin:0;padding:30px}main{max-width:1100px;margin:auto}h1{font-size:32px}section{background:white;border:1px solid #dce7dc;border-radius:16px;padding:24px;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;border-bottom:1px solid #e4ece1;padding:12px;white-space:nowrap}th{color:#60816e}.scroll{overflow:auto}a{color:#246f50}p{line-height:1.8}.status{background:#205e4e;color:white;padding:22px;border-radius:14px}details{margin:20px 0}summary{cursor:pointer;font-weight:600}small{color:#617c69}</style><main><small>VITAL PARTNERS · 보관용 검증 기록</small><h1>18대 조직 · 보너스 종합 테스트</h1><div class="status">${failure ? "검증 실패" : "전체 검증 통과"} · ${checks.filter((c) => c.passed).length}/${checks.length} 항목</div><p>별도 보관 DB에서 실행했습니다. 실제 운영 매출·회원·보너스에는 영향을 주지 않습니다.<br>충전은 PV만 추가하고, 상품 구매 시 한도·배송 주문·보너스가 발생합니다.</p><section><h2>생성 기록</h2>${table(Object.entries(summary.counts).map(([record, count]) => ({ record, count })))}</section><section><h2>직급 구성</h2>${table(grades)}</section><section><h2>보너스별 결과</h2>${table(totals)}<p>test_fixture는 한도 경계 테스트를 위한 준비 기록입니다.</p></section><section><h2>18대 중 13대까지만 롤업</h2>${table(ancestorRows)}</section><section><h2>검증 항목</h2>${table(checks)}</section><section><h2>보관된 전체 원장</h2><p>각 항목을 펼치거나 CSV를 다운로드할 수 있습니다.</p>${Object.entries(
      tables,
    )
      .map(
        ([name, rows]) =>
          "<details><summary>" +
          name +
          " · " +
          rows.length +
          '건</summary><p><a href="' +
          name +
          '.csv">CSV 다운로드</a></p>' +
          table(rows) +
          "</details>",
      )
      .join(
        "",
      )}<p><a href="result.json">검증 결과 JSON</a> · <a href="결과보고서.md">결과 보고서</a></p></section></main></html>`;
    await writeFile(path.join(dir, "index.html"), html);
    await db.close();
    console.log(
      JSON.stringify(
        {
          dir,
          counts: summary.counts,
          checks: checks.length,
          passed: checks.filter((c) => c.passed).length,
          failure,
          totals,
        },
        null,
        2,
      ),
    );
  }
  if (failure) process.exitCode = 1;
}
void main();
