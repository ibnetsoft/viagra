"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { configured, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bankFields } from "@/lib/bank-details";
const memberFields = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().regex(/^[0-9+\- ]{9,20}$/),
  postcode: z.string().regex(/^\d{5}$/),
  address: z.string().trim().min(2).max(200),
  address_detail: z.string().max(200),
});
export async function authenticate(form: FormData) {
  if (!configured())
    return {
      error: "Supabase 연결 후 회원가입과 로그인을 사용할 수 있습니다.",
    };
  const client = await createClient();
  const credentials = z
    .object({ email: z.email(), password: z.string().min(8).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!credentials.success)
    return { error: "이메일과 비밀번호(8자 이상)를 확인하세요." };
  if (form.get("mode") === "signup") {
    if (form.get("portal") === "admin")
      return {
        error: "관리자 계정은 기존 회원에게 권한을 지정하여 생성합니다.",
      };
    const profile = memberFields.safeParse(Object.fromEntries(form));
    const rawBank = {
      bank_name: String(form.get("bank_name") ?? "").trim(),
      account_number: String(form.get("account_number") ?? "").trim(),
      account_holder: String(form.get("account_holder") ?? "").trim(),
    };
    const hasBank = Object.values(rawBank).some(Boolean);
    const bank = hasBank ? bankFields.safeParse(rawBank) : null;
    if (bank && !bank.success)
      return {
        error: "계좌를 등록하려면 은행, 계좌번호, 예금주를 모두 확인하세요.",
      };
    if (!profile.success)
      return {
        error: "이름, 연락처, 우편번호, 주소를 확인하세요.",
      };
    const { error } = await client.auth.signUp({
      ...credentials.data,
      options: {
        data: { ...profile.data, ...(bank?.success ? bank.data : {}) },
      },
    });
    if (error)
      return {
        error:
          "가입하지 못했습니다. 입력 정보 또는 잠시 후 재시도를 확인하세요.",
      };
    return {
      message:
        "가입 신청이 완료되었습니다. 이메일 인증 후 로그인하세요. 추천·후원 배치는 관리자가 첫 충전 전에 등록합니다.",
    };
  }
  const { data, error } = await client.auth.signInWithPassword(
    credentials.data,
  );
  if (error) return { error: "이메일 또는 비밀번호를 확인하세요." };
  if (form.get("portal") === "admin") {
    const { data: profile } = await client
      .from("members")
      .select("role,status")
      .eq("id", data.user.id)
      .single();
    if (profile?.role !== "admin" || profile.status !== "active") {
      await client.auth.signOut();
      return { error: "관리자 권한이 있는 계정으로 로그인하세요." };
    }
    redirect("/admin");
  }
  redirect("/app");
}
export async function logout(portal: "admin" | "member" = "member") {
  if (configured()) {
    const client = await createClient();
    const jar = await cookies();
    const device = jar.get("vp-push-device")?.value;
    if (device) await client.rpc("unsubscribe_push", { p_id: device });
    jar.delete("vp-push-device");
    await client.auth.signOut();
  }
  redirect(portal === "admin" ? "/admin/login" : "/login");
}
async function adminClient() {
  if (!configured()) throw new Error("Supabase 연결이 필요합니다.");
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const { data } = await client
    .from("members")
    .select("role,status")
    .eq("id", user.id)
    .single();
  if (data?.role !== "admin" || data.status !== "active")
    throw new Error("관리자 권한이 필요합니다.");
  return client;
}
export async function mutate(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string }> {
  try {
    const client = await adminClient();
    let rpc: string;
    let args: Record<string, unknown>;
    const uuid = z.uuid();
    if (action === "credit") {
      const p = z
        .object({
          member: uuid,
          request: uuid,
          note: z.string().trim().min(1).max(500),
        })
        .parse(payload);
      rpc = "credit_purchase";
      args = { p_member: p.member, p_request: p.request, p_note: p.note };
    } else if (action === "shipping") {
      const p = z
        .object({
          purchase: uuid,
          status: z.enum(["pending", "delivered"]),
          tracking: z.string().max(100),
        })
        .parse(payload);
      rpc = "update_shipping";
      args = {
        p_purchase: p.purchase,
        p_status: p.status,
        p_tracking: p.tracking,
      };
    } else if (action === "member") {
      const p = memberFields
        .extend({
          id: uuid,
          status: z.enum(["active", "suspended"]),
          referrer_id: uuid.nullable(),
          sponsor_id: uuid.nullable(),
          position: z.enum(["L", "R"]).nullable(),
          center_id: uuid.nullable(),
        })
        .parse(payload);
      rpc = "update_member_with_bank";
      const rawBank = {
        bank_name: payload.bank_name ?? "",
        account_number: payload.account_number ?? "",
        account_holder: payload.account_holder ?? "",
      };
      const bank = Object.values(rawBank).every((v) => v === "")
        ? null
        : bankFields.parse(rawBank);
      args = {
        p_member: p.id,
        p_name: p.name,
        p_phone: p.phone,
        p_postcode: p.postcode,
        p_address: p.address,
        p_detail: p.address_detail,
        p_bank: bank?.bank_name ?? null,
        p_account: bank?.account_number ?? null,
        p_holder: bank?.account_holder ?? null,
        p_status: p.status,
        p_referrer: p.referrer_id,
        p_sponsor: p.sponsor_id,
        p_position: p.position,
        p_center: p.center_id,
      };
    } else if (action === "center") {
      const p = z
        .object({ name: z.string().trim().min(1).max(80), owner: uuid })
        .parse(payload);
      rpc = "create_center";
      args = { p_name: p.name, p_owner: p.owner };
    } else if (action === "close") {
      const p = z
        .object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .parse(payload);
      rpc = "close_day";
      args = { p_day: p.day };
    } else return { error: "지원하지 않는 작업입니다." };
    const { error } = await client.rpc(rpc, args);
    if (error)
      return {
        error:
          error.code === "23505"
            ? "이미 사용 중인 후원 자리 또는 이름입니다."
            : error.message,
      };
    revalidatePath("/admin");
    revalidatePath("/app", "layout");
    return {};
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? "입력값을 확인하세요."
          : error instanceof Error
            ? error.message
            : "처리에 실패했습니다.",
    };
  }
}

export async function buyProduct(
  product: string,
  request: string,
): Promise<{ error?: string }> {
  const parsed = z
    .object({ product: z.uuid(), request: z.uuid() })
    .safeParse({ product, request });
  if (!parsed.success) return { error: "상품 정보를 확인하세요." };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await client.rpc("buy_product", {
    p_product: product,
    p_request: request,
  });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  revalidatePath("/admin");
  return {};
}
export async function loadOrganization(
  mode: "referral" | "sponsor",
  root: string | null,
  offset = 0,
) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (
    !["referral", "sponsor"].includes(mode) ||
    (root && !z.uuid().safeParse(root).success) ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    return { error: "조회 조건을 확인하세요." };
  const { data, error } = await client.rpc("my_organization", {
    p_mode: mode,
    p_root: root,
    p_offset: offset,
  });
  return error ? { error: error.message } : { data };
}

export async function saveMyBank(form: FormData): Promise<{ error?: string }> {
  const bank = bankFields.safeParse(Object.fromEntries(form));
  if (!bank.success)
    return { error: "은행, 계좌번호(숫자 8~20자리), 예금주를 확인하세요." };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await client.rpc("update_my_bank", {
    p_bank: bank.data.bank_name,
    p_account: bank.data.account_number,
    p_holder: bank.data.account_holder,
  });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  revalidatePath("/admin");
  return {};
}
