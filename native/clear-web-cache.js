(function () {
  const marker = 'wd-native-cache-migration-0.4.21';
  if (sessionStorage.getItem(marker) || window.__wdCacheCleanupStarted) return;
  window.__wdCacheCleanupStarted = true;
  (async function () {
    const controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('workbox-')).map(key => caches.delete(key)));
    }
    sessionStorage.setItem(marker, 'done');
    if (controlled) location.reload();
  })().catch(error => { console.error('Native page cache cleanup failed', error); window.__wdCacheCleanupStarted = false; });
})();
