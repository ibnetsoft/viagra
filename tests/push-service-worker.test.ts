import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import webpush from "web-push";
import { createECDH, randomBytes } from "node:crypto";
test("push payload encrypts and service worker shows generic content with same-origin click", async () => {
  const pair = webpush.generateVAPIDKeys(),
    receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const id = crypto.randomUUID();
  const request = webpush.generateRequestDetails(
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/isolated-test",
      keys: {
        p256dh: receiver.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    },
    JSON.stringify({ id }),
    {
      vapidDetails: {
        subject: "https://viagra-iota.vercel.app",
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
      },
      TTL: 86400,
    },
  );
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.ok(!request.body?.toString().includes(id));
  const handlers: Record<string, (event: any) => void> = {};
  const shown: any[] = [],
    opened: string[] = [];
  let pending: Promise<unknown> = Promise.resolve();
  runInNewContext(await readFile("public/app/sw.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://example.test" },
      addEventListener: (name: string, fn: (e: any) => void) =>
        (handlers[name] = fn),
      registration: {
        showNotification: async (...args: any[]) => shown.push(args),
      },
      clients: {
        matchAll: async () => [],
        openWindow: async (url: string) => opened.push(url),
      },
    },
  });
  handlers.push({
    data: { json: () => ({ id, body: "PRIVATE TEXT" }) },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(shown.length, 1);
  assert.ok(!JSON.stringify(shown).includes("PRIVATE TEXT"));
  handlers.notificationclick({
    notification: { close() {}, data: shown[0][1].data },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(opened[0], "https://example.test/app/notifications?id=" + id);
  handlers.notificationclick({
    notification: { close() {}, data: { url: "https://evil.test" } },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(opened.length, 1);
});
