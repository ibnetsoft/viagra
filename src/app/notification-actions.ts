"use server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { after } from "next/server";
import { dispatchPush } from "@/lib/push-worker";
import { z } from "zod";

async function session(admin = false) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const { data } = await db
    .from("members")
    .select("role,status")
    .eq("id", user.id)
    .single();
  if (data?.status !== "active" || (admin && data.role !== "admin"))
    throw new Error("접근 권한이 없습니다.");
  return { db, user };
}
export async function noticeAdminList() {
  const { db } = await session(true);
  const { data, error } = await db.rpc("announcement_stats");
  if (error) throw new Error("공지를 불러오지 못했습니다.");
  return data;
}
export async function saveNotice(input: unknown) {
  const a = z
    .object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(5000),
      target_mode: z.enum(["all", "selected"]),
      target_ids: z.array(z.uuid()).max(500),
      push_enabled: z.boolean(),
    })
    .parse(input);
  const { db } = await session(true);
  const { data, error } = await db.rpc("save_announcement", {
    p_id: a.id,
    p_title: a.title,
    p_body: a.body,
    p_mode: a.target_mode,
    p_targets: a.target_ids,
    p_push: a.push_enabled,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; revision: number };
}
export async function publishNotice(id: string, revision: number) {
  z.uuid().parse(id);
  z.number().int().positive().parse(revision);
  const { db } = await session(true);
  const { data, error } = await db.rpc("publish_announcement", {
    p_id: id,
    p_revision: revision,
  });
  if (error) throw new Error(error.message);
  after(async () => {
    try {
      await dispatchPush();
    } catch {
      console.error("Push dispatch deferred to scheduled retry");
    }
  });
  return Number(data);
}
export async function memberNotices(page = 0) {
  z.number().int().min(0).max(10000).parse(page);
  const { db } = await session();
  const { data, error } = await db.rpc("member_announcements", {
    p_page: page,
  });
  if (error) throw new Error("알림을 불러오지 못했습니다.");
  return data as { items: unknown[]; unread: number };
}
export async function readNotice(id: string | null) {
  if (id !== null) z.uuid().parse(id);
  const { db } = await session();
  const { error } = await db.rpc("read_announcement", { p_id: id });
  if (error) throw new Error("읽음 처리하지 못했습니다.");
}
export async function pushConfig() {
  await session();
  return process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? (process.env.VAPID_PUBLIC_KEY ?? "")
    : "";
}
export async function pushStatus(endpoint: string) {
  z.string().max(2048).parse(endpoint);
  const { db } = await session();
  const { data, error } = await db.rpc("my_push_status", {
    p_endpoint: endpoint,
  });
  if (error) throw new Error("기기 설정을 확인하지 못했습니다.");
  return data as string | null;
}
export async function enablePush(input: unknown) {
  const sub = z
    .object({
      endpoint: z.string().max(2048),
      keys: z.object({
        p256dh: z.string().length(87),
        auth: z.string().length(22),
      }),
    })
    .parse(input);
  const { db } = await session();
  const { data, error } = await db.rpc("subscribe_push", {
    p_endpoint: sub.endpoint,
    p_key: sub.keys.p256dh,
    p_auth: sub.keys.auth,
  });
  if (error) throw new Error(error.message);
  (await cookies()).set("vp-push-device", data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 31536000,
  });
  return data as string;
}
export async function disablePush(id: string) {
  z.uuid().parse(id);
  const { db } = await session();
  const { error } = await db.rpc("unsubscribe_push", { p_id: id });
  if (error) throw new Error("알림을 끄지 못했습니다. 다시 시도하세요.");
  (await cookies()).delete("vp-push-device");
}
