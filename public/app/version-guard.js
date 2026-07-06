// version-guard.js
//
// Soft-refresh staleness guard. Firebase serves the app page and pipeline/app modules with
// Cache-Control: no-cache, but a service worker (model cache) or a soft reload can
// still leave the page running an older build than what is deployed. This module
// compares the build stamp baked into index.html (<meta name="simulatte-build">)
// against the freshly-fetched /version.json and performs at most ONE guarded
// reload — clearing stale simulatte-* caches first — when they disagree.
//
// Loop-safety: the deployed build is recorded in sessionStorage before reloading.
// After the reload the page is fresh, the builds match, and the flag is cleared. If
// the page is somehow still stale, the flag suppresses any further reload, so the
// user can never be trapped in a reload loop.
(function attachSimulatteVersionGuard(root) {
  if (!root || !root.document || typeof root.fetch !== 'function') return;
  const doc = root.document;
  const meta = doc.querySelector('meta[name="simulatte-build"]');
  const runningBuild = meta ? String(meta.getAttribute('content') || '') : '';
  const RELOAD_FLAG = 'simulatte.versionGuard.reloaded';
  const session = (() => {
    try { return root.sessionStorage; } catch (_err) { return null; }
  })();

  function purgeStaleCaches() {
    if (!root.caches || typeof root.caches.keys !== 'function') return Promise.resolve();
    return root.caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.indexOf('simulatte-') === 0)
        .map((name) => root.caches.delete(name))))
      .catch(() => {});
  }

  function check() {
    root.fetch('./version.json', { cache: 'no-store' })
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.build) return;
        const deployed = String(data.build);
        // Unstamped local dev, or already up to date: clear any stale flag and stop.
        if (!runningBuild || runningBuild === 'dev' || deployed === runningBuild) {
          if (session) session.removeItem(RELOAD_FLAG);
          return;
        }
        // Already reloaded once this session for a mismatch — never loop.
        if (session && session.getItem(RELOAD_FLAG)) return;
        if (session) session.setItem(RELOAD_FLAG, deployed);
        purgeStaleCaches().then(() => root.location.reload());
      })
      .catch(() => {});
  }

  if (doc.readyState === 'complete') check();
  else root.addEventListener('load', check);
})(typeof globalThis !== 'undefined' ? globalThis : window);
