self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let id = "";
  try {
    const value = event.data.json().id;
    if (/^[0-9a-f-]{36}$/i.test(value)) id = value;
  } catch {}
  event.waitUntil(
    self.registration.showNotification("활력 파트너스", {
      body: "새 공지가 도착했습니다. 앱에서 확인해 주세요.",
      icon: "/app/icon-192.png",
      badge: "/app/icon-192.png",
      tag: id || "announcement",
      data: { url: "/app/notifications" + (id ? "?id=" + id : "") },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/app/notifications",
    self.location.origin,
  );
  if (
    target.origin !== self.location.origin ||
    target.pathname !== "/app/notifications"
  )
    return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const app = windows.find((client) =>
        new URL(client.url).pathname.startsWith("/app"),
      );
      if (app) {
        await app.navigate(target.href);
        return app.focus();
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
