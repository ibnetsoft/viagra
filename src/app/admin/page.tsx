import { configured, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Workspace from "@/components/admin-workspace";
import type { AppData } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) {
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.ENABLE_DEMO === "true"
    )
      return <Workspace demo initialData={null} userId="demo-admin" />;
    return (
      <main className="setup">
        <h1>활력 파트너스</h1>
        <p>서비스 연결을 준비하고 있습니다.</p>
        <p>관리자는 Supabase 환경변수와 데이터베이스 설치를 완료해 주세요.</p>
      </main>
    );
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error } = await client
    .from("members")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !profile)
    return (
      <main className="setup">
        <h1>회원 정보를 불러오지 못했습니다.</h1>
        <p>관리자에게 데이터베이스 설치 상태를 확인해 주세요.</p>
      </main>
    );
  if (profile.role !== "admin") redirect("/admin/login");
  if (profile.status !== "active")
    return (
      <main className="setup">
        <h1>이용이 정지된 계정입니다.</h1>
        <p>관리자에게 문의하세요.</p>
        <a href="/admin/login">관리자 로그인</a>
      </main>
    );
  async function readAll(
    table: "members" | "purchases" | "bonuses" | "centers" | "pv_topups",
  ) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .order(table === "centers" ? "id" : "created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error) return { data: null, error };
      rows.push(...data);
      if (data.length < 500) return { data: rows, error: null };
    }
  }
  const results = await Promise.all([
    readAll("members"),
    readAll("purchases"),
    readAll("bonuses"),
    client
      .from("audits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    readAll("centers"),
    readAll("pv_topups"),
  ]);
  if (results.some((r) => r.error))
    return (
      <main className="setup">
        <h1>데이터를 불러오지 못했습니다.</h1>
        <p>연결 상태와 접근 권한을 확인한 후 다시 시도하세요.</p>
        <a href="/admin">다시 시도</a>
      </main>
    );
  const [members, purchases, bonuses, audits, centers, topups] = results.map(
    (r) => r.data ?? [],
  );
  return (
    <Workspace
      demo={false}
      initialData={
        {
          members,
          purchases: purchases.filter((p) => p.payment_method === "pv"),
          topups,
          bonuses,
          audits,
          centers,
        } as AppData
      }
      userId={user.id}
    />
  );
}
