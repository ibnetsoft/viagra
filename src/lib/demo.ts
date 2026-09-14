import {
  allocateBonus,
  type AppData,
  type Member,
  type Product,
  terms,
} from "./domain";
const names = [
  "김민준",
  "이서연",
  "박지훈",
  "최유진",
  "정도윤",
  "한수빈",
  "윤하준",
];
export function seedDemo(): AppData {
  const members: Member[] = names.map((name, i) => ({
    id: `demo-${i}`,
    member_code: `VP${String(1001 + i)}`,
    name,
    email: `member${i + 1}@example.com`,
    phone: "010-0000-0000",
    postcode: "04524",
    address: "서울특별시 중구 세종대로 110",
    address_detail: "예시 배송지",
    role: "member",
    status: "active",
    referrer_id: i ? `demo-${Math.max(0, i - 2)}` : null,
    sponsor_id: i ? `demo-${Math.floor((i - 1) / 2)}` : null,
    position: i ? (i % 2 ? "L" : "R") : null,
    center_id: "center-demo",
    pv: 300000,
    bonus_limit: 1500000,
    bonus_paid: 0,
    created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  }));
  const data: AppData = {
    members,
    topups: members.map((m, i) => ({
      id: `topup-${i}`,
      member_id: m.id,
      kind: "initial",
      cash: 370000,
      pv: 300000,
      note: "샘플 PV 충전",
      created_at: m.created_at,
    })),
    purchases: members.map((m, i) => ({
      id: `purchase-${i}`,
      member_id: m.id,
      kind: "initial",
      payment_method: "pv",
      pv_spent: 300000,
      cash: 0,
      pv: 300000,
      cap_added: 1500000,
      shipping_status: i < 3 ? "delivered" : "pending",
      recipient: m.name,
      phone: m.phone,
      address: `(${m.postcode}) ${m.address} ${m.address_detail}`,
      tracking: "",
      note: "샘플 입금 확인",
      created_at: m.created_at,
    })),
    bonuses: [],
    audits: [],
    centers: [{ id: "center-demo", name: "서울 센터", owner_id: "demo-0" }],
  };
  award(data, "demo-0", "demo-referral-1", "referral", 90000);
  award(data, "demo-0", "demo-referral-2", "referral", 90000);
  award(data, "demo-0", "triangle1:demo-0", "triangle1", 90000);
  data.members.push({
    ...members[0],
    id: "demo-admin",
    name: "운영 관리자",
    member_code: "ADMIN",
    email: "admin@example.com",
    role: "admin",
    referrer_id: null,
    sponsor_id: null,
    position: null,
    center_id: null,
    pv: 0,
    bonus_limit: 0,
    bonus_paid: 0,
  });
  return data;
}
function award(
  data: AppData,
  id: string,
  key: string,
  kind: string,
  gross: number,
) {
  if (data.bonuses.some((b) => b.member_id === id && b.event_key === key))
    return;
  const member = data.members.find((m) => m.id === id);
  if (!member || member.role !== "member") return;
  const allocation = allocateBonus(
    gross,
    member.status === "active"
      ? kind === "center" || kind === "center_referral"
        ? member.bonus_paid + gross
        : member.bonus_limit
      : 0,
    member.bonus_paid,
  );
  if (kind !== "center" && kind !== "center_referral")
    member.bonus_paid += allocation.paid;
  data.bonuses.unshift({
    id: crypto.randomUUID(),
    member_id: id,
    event_key: key,
    kind,
    ...allocation,
    reason: allocation.expired
      ? member.status === "suspended"
        ? "회원 정지"
        : "지급 한도 초과"
      : "",
    created_at: new Date().toISOString(),
  });
}
export function demoCredit(
  original: AppData,
  id: string,
  note: string,
  requestId: string,
  product?: Product,
): AppData {
  const data = structuredClone(original);
  if (
    data.purchases.some((p) => p.id === requestId) ||
    data.topups?.some((p) => p.id === requestId)
  )
    return data;
  const member = data.members.find((m) => m.id === id);
  if (!member || member.role !== "member" || member.status !== "active")
    throw new Error("충전할 수 없는 회원입니다.");
  if (!product) {
    data.topups ??= [];
    const kind = data.topups.some((p) => p.member_id === id)
      ? "repeat"
      : "initial";
    const t = terms[kind];
    member.pv += t.pv;
    data.topups.unshift({
      id: requestId,
      member_id: id,
      kind,
      cash: t.cash,
      pv: t.pv,
      note,
      created_at: new Date().toISOString(),
    });
    data.audits.unshift({
      id: crypto.randomUUID(),
      action: "PV 충전",
      actor: "데모 관리자",
      detail: member.name + " · " + t.pv + " PV",
      created_at: new Date().toISOString(),
    });
    return data;
  }
  if (!data.triangleWaiting) {
    data.triangleWaiting = {};
    for (const order of [...data.purchases].reverse()) {
      if (order.payment_method === "pv")
        recordTriangle(data, order.member_id, order.id);
    }
    matchTriangles(data, false);
  }
  const kind = data.purchases.some((p) => p.member_id === id)
    ? "repeat"
    : "initial";
  const t = product
    ? {
        cash: 0,
        pv:
          kind === "repeat"
            ? (product.repeat_pv_price ?? product.pv_price)
            : product.pv_price,
        cap: 1500000,
      }
    : terms[kind];
  if (product && (!product.active || member.pv < t.pv))
    throw new Error("보유 PV가 부족합니다.");
  member.pv += product ? -t.pv : t.pv;
  member.bonus_limit += t.cap;
  data.purchases.unshift({
    id: requestId,
    member_id: id,
    kind,
    cash: t.cash,
    payment_method: product ? "pv" : "cash",
    product_id: product?.id,
    product_name: product?.name ?? "활력단 15개",
    pv_spent: product ? t.pv : 0,
    pv: t.pv,
    cap_added: t.cap,
    shipping_status: "pending",
    recipient: member.name,
    phone: member.phone,
    address: `(${member.postcode}) ${member.address} ${member.address_detail}`,
    tracking: "",
    note,
    created_at: new Date().toISOString(),
  });
  if (kind === "initial") {
    let parent = member.referrer_id;
    for (const rate of [0.3, 0.1]) {
      if (!parent) break;
      award(data, parent, `${requestId}:referral`, "referral", t.pv * rate);
      parent = data.members.find((m) => m.id === parent)?.referrer_id ?? null;
    }
  } else {
    let parent = member.sponsor_id;
    for (let depth = 1; depth <= 13 && parent; depth++) {
      award(data, parent, `${requestId}:rollup`, "rollup", 10000);
      parent = data.members.find((m) => m.id === parent)?.sponsor_id ?? null;
    }
  }
  recordTriangle(data, id, requestId);
  matchTriangles(data, true);
  const center = data.centers.find((c) => c.id === member.center_id);
  if (center) {
    const owner = data.members.find(
      (m) => m.id === center.owner_id && m.role === "member",
    );
    if (owner)
      (data.centerSales ??= []).push({
        purchase_id: requestId,
        center_id: center.id,
        center_name: center.name,
        owner_id: owner.id,
        referrer_id: owner.referrer_id,
        pv: t.pv,
        day: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date()),
      });
  }
  data.audits.unshift({
    id: crypto.randomUUID(),
    action: product ? "PV 상품 구매" : "수동 충전",
    actor: "데모 관리자",
    detail: `${member.name} · ${t.cash.toLocaleString()}원 확인`,
    created_at: new Date().toISOString(),
  });
  return data;
}

function recordTriangle(data: AppData, memberId: string, purchase: string) {
  const member = data.members.find(
    (m) => m.id === memberId && m.role === "member",
  );
  if (!member) return;
  const add = (root: string, slot: "self" | "L" | "R") => {
    const waiting = (data.triangleWaiting ??= {});
    const queues = (waiting[root] ??= { self: [], L: [], R: [] });
    queues[slot].push(purchase);
  };
  add(member.id, "self");
  if (member.sponsor_id && member.position)
    add(member.sponsor_id, member.position);
}
function matchTriangles(data: AppData, pay: boolean) {
  for (const [root, queues] of Object.entries(data.triangleWaiting ?? {})) {
    while (queues.self.length && queues.L.length && queues.R.length) {
      const key = [
        queues.self.shift(),
        queues.L.shift(),
        queues.R.shift(),
      ].join(":");
      if (!pay) continue;
      let beneficiary = data.members.find((m) => m.id === root);
      for (let depth = 1; depth <= 3 && beneficiary; depth++) {
        if (beneficiary.role === "member" && beneficiary.bonus_limit > 0)
          award(
            data,
            beneficiary.id,
            `triangle${depth}:match:${root}:${key}`,
            `triangle${depth}`,
            depth === 3 ? 60000 : 90000,
          );
        beneficiary = data.members.find(
          (m) => m.id === beneficiary?.sponsor_id,
        );
      }
    }
  }
}
export function demoCloseCenters(original: AppData, day: string): AppData {
  const data = structuredClone(original);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today)
    throw new Error("마감된 날짜만 정산할 수 있습니다.");
  if (data.centerClosedDays?.includes(day)) return data;
  (data.centerClosedDays ??= []).push(day);
  const sales = (data.centerSales ?? []).filter((s) => s.day === day);
  const owners = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = `${sale.center_id}:${sale.owner_id}`;
    owners.set(key, [...(owners.get(key) ?? []), sale]);
  }
  for (const [key, rows] of owners) {
    const first = rows[0];
    award(
      data,
      first.owner_id,
      `center:${day}:${first.center_id}`,
      "center",
      Math.floor((rows.reduce((n, s) => n + s.pv, 0) * 3) / 100),
    );
    for (const ref of new Set(rows.map((s) => s.referrer_id))) {
      const pv = rows
        .filter((s) => s.referrer_id === ref)
        .reduce((n, s) => n + s.pv, 0);
      const amount = Math.floor((pv * 2) / 100);
      if (ref)
        award(
          data,
          ref,
          `center-referral:${day}:${key}`,
          "center_referral",
          amount,
        );
      else
        (data.centerUnpaid ??= []).unshift({
          id: crypto.randomUUID(),
          day,
          center_name: first.center_name,
          owner_id: first.owner_id,
          sales_pv: pv,
          amount,
          reason: "센터장 추천인 없음",
          created_at: new Date().toISOString(),
        });
    }
  }
  return data;
}
