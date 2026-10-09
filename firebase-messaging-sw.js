/* Firebase Cloud Messaging - Cobertura ECT 2026 */
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
importScripts('./config.js');

firebase.initializeApp(self.ECT_FIREBASE_CONFIG);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'Cobertura ECT';
  const options = {
    body: data.body || 'Tenés un nuevo aviso de cobertura.',
    icon: './logo.png',
    badge: './logo.png',
    tag: data.tag || 'ect-cobertura',
    renotify: true,
    data: { url: data.url || './' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of windows) {
      if ('focus' in client) {
        try { await client.navigate(target); } catch {}
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
