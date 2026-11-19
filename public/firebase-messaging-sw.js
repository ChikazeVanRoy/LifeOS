// Shows reminders sent through Firebase Cloud Messaging. The sender puts the text in `data`,
// and this shows it, because iPhones only allow a push that ends in a visible notification.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* not JSON */
  }
  const data = payload.data || payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "LifeOS", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "lifeos-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) if ("focus" in client) return client.focus();
      return self.clients.openWindow(url);
    }),
  );
});
