import assert from "node:assert/strict";
import webpush from "web-push";
import { dispatchPush } from "../../src/lib/push-worker";

async function main() {
  const pair = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = pair.publicKey;
  process.env.VAPID_PRIVATE_KEY = pair.privateKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
  let claimed = false;
  const updates: { url: string; body: any }[] = [],
    payloads: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/rpc/claim_push_jobs")) {
      const jobs = claimed
        ? []
        : [0, 1, 2, 3, 4].map((i) => ({
            id: `job-${i}`,
            announcement_id: `notice-${i}`,
            subscription_id: `sub-${i}`,
            member_id: `member-${i}`,
            lease_token: `lease-${i}`,
            endpoint: `https://fcm.googleapis.com/fcm/send/${i}`,
            p256dh: "test",
            auth_key: "test",
            attempts: i === 3 ? 5 : 1,
          }));
      claimed = true;
      return Response.json(jobs);
    }
    if (init?.method === "PATCH") {
      updates.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }
    if (url.includes("/push_subscriptions?"))
      return Response.json(url.includes("sub-4") ? null : { id: "active" });
    throw new Error("Unexpected network access: " + url);
  };
  webpush.sendNotification = async (subscription, payload) => {
    payloads.push(String(payload));
    if (subscription.endpoint.endsWith("/1")) throw { statusCode: 410 };
    if (subscription.endpoint.endsWith("/2")) throw { statusCode: 503 };
    if (subscription.endpoint.endsWith("/3")) throw { statusCode: 429 };
    return { statusCode: 201, body: "", headers: {} };
  };
  assert.equal(await dispatchPush(), 5);
  const delivery = updates.filter((u) => u.url.includes("/push_deliveries?"));
  for (const [i, status] of [
    "sent",
    "expired",
    "pending",
    "failed",
    "cancelled",
  ].entries()) {
    const record = delivery.find((u) => u.url.includes(`job-${i}`));
    assert.equal(record?.body.status, status);
    assert.ok(record?.url.includes(`lease-${i}`));
    assert.ok(record?.url.includes("status=eq.sending"));
  }
  assert.equal(payloads.length, 4);
  assert.ok(
    updates.some(
      (u) =>
        u.url.includes("/push_subscriptions?") &&
        u.url.includes("sub-1") &&
        u.body.disabled_at,
    ),
  );
  assert.deepEqual(JSON.parse(payloads[0]), { id: "notice-0" });
  console.log("worker transport outcomes verified");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
