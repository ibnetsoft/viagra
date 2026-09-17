import { notFound, redirect } from "next/navigation";
import { configured, createClient } from "@/lib/supabase/server";
import MemberApp, { type MemberSection } from "@/components/member-app";
import { memberSnapshot } from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";
import type { Member, Purchase, Bonus, Withdrawal } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section: segments } = await params;
  const section = segments?.[0] ?? "home";
  if (
    (segments?.length ?? 0) > 1 ||
    ![
      "home",
      "bonuses",
      "orders",
      "profile",
      "products",
      "organization",
      "notifications",
    ].includes(section)
  )
    notFound();
  if (!configured()) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ENABLE_DEMO !== "true"
    )
      return (
        <main className="setup">
          <h1>서비스를 준비하고 있습니다.</h1>
        </main>
      );
    return (
      <MemberApp
        key={section}
        demo
        initialData={memberSnapshot(seedDemo(), "demo-1")}
        section={section as MemberSection}
      />
    );
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: member, error } = await client
    .from("members")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !member) throw new Error("회원 정보를 불러오지 못했습니다.");
  if (member.role === "admin") redirect("/login");
  if (member.status !== "active")
    return (
      <main className="setup">
        <h1>이용이 정지된 계정입니다.</h1>
        <p>관리자에게 문의하세요.</p>
        <a href="/login">로그인 화면</a>
      </main>
    );
  // Explicit ownership filters remain in place even if the signed-in user has admin privileges.
  async function ownRows(table: "purchases" | "bonuses" | "withdrawals") {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from(table).select("*").eq("member_id", user!.id);
      if (table === "purchases") query = query.eq("payment_method", "pv");
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("내 활동 내역을 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  let purchaseCount: number | undefined;
  async function homePurchases() {
    const { data, count, error } = await client
      .from("purchases")
      .select("*", { count: "exact" })
      .eq("member_id", user!.id)
      .eq("payment_method", "pv")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(1);
    if (error) throw new Error("구매 정보를 불러오지 못했습니다.");
    purchaseCount = count ?? 0;
    return data;
  }
  const [
    purchases,
    bonuses,
    withdrawals,
    gradeResult,
    centerResult,
    productsResult,
    totalResult,
  ] = await Promise.all([
    ["home", "products"].includes(section)
      ? homePurchases()
      : section === "orders"
        ? ownRows("purchases")
        : Promise.resolve([]),
    section === "bonuses" ? ownRows("bonuses") : Promise.resolve([]),
    ["bonuses", "profile"].includes(section) ? ownRows("withdrawals") : Promise.resolve([]),
    ["home", "profile"].includes(section)
      ? client.rpc("my_grade")
      : Promise.resolve({ data: null, error: null }),
    section === "profile" && member.center_id
      ? client
          .from("centers")
          .select("name")
          .eq("id", member.center_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    section === "products"
      ? client.from("products").select("*").eq("active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
    section === "home"
      ? client.rpc("my_bonus_total")
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (
    totalResult.error ||
    gradeResult.error ||
    centerResult.error ||
    productsResult.error
  )
    throw new Error("회원 정보를 불러오지 못했습니다.");
  return (
    <MemberApp
      key={section}
      demo={false}
      section={section as MemberSection}
      initialData={{
        products: productsResult.data ?? [],
        purchaseCount,
        totalPaid:
          totalResult.data === null ? undefined : Number(totalResult.data),
        member: { ...member, grade: gradeResult.data } as Member,
        purchases: purchases.filter(
          (p) => p.payment_method === "pv",
        ) as Purchase[],
        bonuses: bonuses as Bonus[],
        withdrawals: withdrawals as Withdrawal[],
        centerName: centerResult.data?.name ?? null,
      }}
    />
  );
}
