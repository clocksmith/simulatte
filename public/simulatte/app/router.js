(function attachSimulatteRouter(root, factory) {
  const api = factory();
  root.SimulatteRouter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteRouterModule() {
  // The URL path is the single source of truth for {world scale (tier), experience (profile id)}.
  //   /                                 -> landing (no tier chosen)
  //   /world                            -> planet scale, default experience (canonicalized in place)
  //   /world/maritime-trade-global-v1   -> planet scale + that experience
  // Tier ids are already URL-safe, so they double as the first path segment; the experience
  // segment is the full application-profile id. No query params, no page reloads.
  const TIERS = Object.freeze(['city', 'country', 'world', 'solar-system', 'star-chart']);
  const TIER_SET = new Set(TIERS);

  function decodeSegment(segment) {
    try { return decodeURIComponent(segment); } catch (_error) { return segment; }
  }

  function parsePath(pathname) {
    const parts = String(pathname || '/').split('/').filter(Boolean).map(decodeSegment);
    if (!parts.length || !TIER_SET.has(parts[0])) return { tier: null, experience: null };
    return { tier: parts[0], experience: parts[1] || null };
  }

  function hrefFor(route) {
    if (!route || !route.tier || !TIER_SET.has(route.tier)) return '/';
    const tier = encodeURIComponent(route.tier);
    return route.experience ? `/${tier}/${encodeURIComponent(route.experience)}` : `/${tier}`;
  }

  // A router instance binds the URL to a single onRoute handler. navigate() adds a history entry
  // and re-renders; canonicalize() rewrites the current entry in place (used to fill in a
  // resolved default experience) without adding history; popstate re-renders from the URL.
  function createRouter(view) {
    const target = view || (typeof window !== 'undefined' ? window : null);
    if (!target) throw new Error('simulatte_router_requires_window');
    let onRoute = null;

    function currentRoute() { return parsePath(target.location.pathname); }
    function dispatch(meta) { return onRoute ? onRoute(currentRoute(), meta || {}) : undefined; }

    function navigate(route, { replace = false } = {}) {
      const href = hrefFor(route);
      if (href === target.location.pathname) return Promise.resolve();
      target.history[replace ? 'replaceState' : 'pushState']({}, '', href);
      return Promise.resolve(dispatch({ viaPopstate: false }));
    }

    function canonicalize(route) {
      const href = hrefFor(route);
      if (href !== target.location.pathname) target.history.replaceState({}, '', href);
    }

    function start(handler) {
      onRoute = handler;
      target.addEventListener('popstate', () => { void dispatch({ viaPopstate: true }); });
      return Promise.resolve(dispatch({ viaPopstate: false, initial: true }));
    }

    return Object.freeze({ TIERS, parsePath, hrefFor, currentRoute, navigate, canonicalize, start });
  }

  return Object.freeze({ TIERS, parsePath, hrefFor, createRouter });
});
