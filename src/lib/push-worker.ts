import "server-only";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export async function dispatchPush() {
  const {
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL,
  } = process.env;
  if (
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !NEXT_PUBLIC_SUPABASE_URL
  )
    return 0;
  const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const start = Date.now();
  let processed = 0;
  while (Date.now() - start < 35000) {
    const { data: jobs, error } = await db.rpc("claim_push_jobs", {
      p_limit: 5,
    });
    if (error) throw new Error("Push queue unavailable");
    if (!jobs?.length) break;
    await Promise.all(
      jobs.map(
        async (job: {
          id: string;
          announcement_id: string;
          subscription_id: string;
          member_id: string;
          lease_token: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          attempts: number;
        }) => {
          let status = "sent",
            code: string | null = null;
          const { data: active } = await db
            .from("push_subscriptions")
            .select("id,members!inner(status)")
            .eq("id", job.subscription_id)
            .eq("member_id", job.member_id)
            .is("disabled_at", null)
            .eq("members.status", "active")
            .maybeSingle();
          if (!active) status = "cancelled";
          else
            try {
              if (
                !/^https:\/\/(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)\/[^\s]+$/.test(
                  job.endpoint,
                )
              )
                throw { statusCode: 400 };
              await webpush.sendNotification(
                {
                  endpoint: job.endpoint,
                  keys: { p256dh: job.p256dh, auth: job.auth_key },
                },
                JSON.stringify({ id: job.announcement_id }),
                {
                  TTL: 86400,
                  timeout: 5000,
                  vapidDetails: {
                    subject:
                      process.env.VAPID_SUBJECT ||
                      "https://viagra-iota.vercel.app",
                    publicKey: VAPID_PUBLIC_KEY,
                    privateKey: VAPID_PRIVATE_KEY,
                  },
                },
              );
            } catch (e) {
              const http = Number(
                (e as { statusCode?: number }).statusCode || 0,
              );
              code = http ? `HTTP_${http}` : "NETWORK_ERROR";
              if (http === 404 || http === 410) {
                status = "expired";
                await db
                  .from("push_subscriptions")
                  .update({ disabled_at: new Date().toISOString() })
                  .eq("id", job.subscription_id);
              } else
                status =
                  job.attempts < 5 && (!http || http === 429 || http >= 500)
                    ? "pending"
                    : "failed";
            }
          const { error: updateError } = await db
            .from("push_deliveries")
            .update({
              status,
              last_error: code,
              sent_at: status === "sent" ? new Date().toISOString() : null,
              next_attempt_at: new Date(
                Date.now() + 60000 * 2 ** job.attempts,
              ).toISOString(),
            })
            .eq("id", job.id)
            .eq("lease_token", job.lease_token)
            .eq("status", "sending");
          if (updateError) throw new Error("Push result unavailable");
          processed++;
        },
      ),
    );
  }
  return processed;
}
