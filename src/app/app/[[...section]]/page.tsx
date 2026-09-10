import { notFound, redirect } from "next/navigation";
import { configured, createClient } from "@/lib/supabase/server";
import MemberApp, { type MemberSection } from "@/components/member-app";
import { memberSnapshot } from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";
import type { Member, Purchase, Bonus } from "@/lib/domain";
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
    !["home", "bonuses", "orders", "profile"].includes(section)
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
  if (member.status !== "active")
    return (
      <main className="setup">
        <h1>이용이 정지된 계정입니다.</h1>
        <p>관리자에게 문의하세요.</p>
        <a href="/login">로그인 화면</a>
      </main>
    );
  // Explicit ownership filters remain in place even if the signed-in user has admin privileges.
  async function ownRows(table: "purchases" | "bonuses") {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("member_id", user!.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("내 활동 내역을 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const [purchases, bonuses, gradeResult, centerResult] = await Promise.all([
    ownRows("purchases"),
    ownRows("bonuses"),
    client.rpc("my_grade"),
    member.center_id
      ? client
          .from("centers")
          .select("name")
          .eq("id", member.center_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (gradeResult.error || centerResult.error)
    throw new Error("회원 정보를 불러오지 못했습니다.");
  return (
    <MemberApp
      demo={false}
      section={section as MemberSection}
      initialData={{
        member: { ...member, grade: gradeResult.data } as Member,
        purchases: purchases as Purchase[],
        bonuses: bonuses as Bonus[],
        centerName: centerResult.data?.name ?? null,
      }}
    />
  );
}
