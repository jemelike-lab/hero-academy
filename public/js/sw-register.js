/**
 * Hero Academy — Service Worker registration with auto-update reload.
 *
 * Why this exists:
 * The browser-tab that's open when you deploy continues being controlled by
 * the OLD service worker for that page's lifetime. The NEW service worker
 * installs in the background and only becomes the controller on the NEXT
 * navigation. That's why right after a deploy, the first reload still loads
 * stale cached assets and a second reload is needed.
 *
 * This script detects when a freshly-installed SW reaches the 'activated'
 * state and performs a one-time `location.reload()` so the current tab
 * immediately picks up the new assets.
 *
 * The reload is skipped entirely on first-ever visit (no prior controller),
 * and a per-tab `reloaded` guard prevents loops if multiple updates fire.
 *
 * To opt out of the reload during a sensitive operation (e.g. a kid is
 * mid-session), set `window.__ha_inSession = true` and the listener will
 * defer the reload. Set it back to false at session end if you want the
 * pending update to take.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then(function (reg) {
    var reloaded = false;

    function maybeReload(reason) {
      if (reloaded) return;
      // First-ever visit: no existing controller → nothing to upgrade from.
      if (!navigator.serviceWorker.controller) return;
      // Active session: defer; the next manual reload (or next visit) will
      // pick up the new SW since it's already the waiting/active worker.
      if (window.__ha_inSession) {
        try { console.log('[sw-register] new SW ready but session is active — deferring reload'); } catch (_) {}
        return;
      }
      reloaded = true;
      try { console.log('[sw-register] new SW activated (' + reason + ') — reloading'); } catch (_) {}
      location.reload();
    }

    function watch(sw) {
      if (!sw) return;
      // Already activated by the time we're listening? Reload now.
      if (sw.state === 'activated') { maybeReload('already-activated'); return; }
      sw.addEventListener('statechange', function () {
        if (sw.state === 'activated') maybeReload('statechange');
      });
    }

    // Anything currently waiting to take over?
    if (reg.waiting) watch(reg.waiting);
    // Future installs while this tab is open
    reg.addEventListener('updatefound', function () { watch(reg.installing); });
  }).catch(function (err) {
    try { console.warn('[sw-register] registration failed', err); } catch (_) {}
  });
})();
