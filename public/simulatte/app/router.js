(function attachSimulatteRouter(root, factory) {
  const tierRegistry = typeof module === 'object' && module.exports
    ? require('./tier-registry.js')
    : root.SimulatteTierRegistry;
  const api = factory(tierRegistry);
  root.SimulatteRouter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteRouterModule(tierRegistry) {
  // The URL is the single source of truth for world scale, experience, and the
  // reproducible simulation selection. Simulation state is kept in readable
  // query fields so a copied URL can reconstruct the same run without relying
  // on sessionStorage or an in-memory controller.
  //   /                                 -> landing (no tier chosen)
  //   /world                            -> planet scale, default experience (canonicalized in place)
  //   /world/maritime-trade-global-v1   -> planet scale + that experience
  // Tier ids are already URL-safe, so they double as the first path segment; the experience
  // segment is the full application-profile id. Query fields are:
  //   ?world=<world id>&profile=<profile id>&camera=<mode>&scenario=<seed id>
  //     &seed=<declared seed>&mission=<text>&param.<plugin>.<control>=<JSON>
  // Navigation is still in-place; changing a URL state tears down and remounts
  // the owning experience through the app shell rather than reloading the page.
  if (!tierRegistry) throw new Error('simulatte_router_tier_registry_missing');
  const TIERS = tierRegistry.TIER_IDS;
  const TIER_SET = new Set(TIERS);
  const CAMERA_MODES = new Set(['bird', 'compare', 'follow', 'free', 'overview', 'pov', 'top']);
  const ID_PATTERN = /^[a-z0-9][a-z0-9.:-]*$/;

  function cloneValue(value) {
    return Array.isArray(value) ? value.map(cloneValue)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
        : value;
  }

  function setParameter(parameters, key, value) {
    const separator = key.indexOf('.');
    if (separator <= 0 || separator === key.length - 1) return;
    const pluginId = key.slice(0, separator);
    const controlId = key.slice(separator + 1);
    if (!parameters[pluginId]) parameters[pluginId] = {};
    parameters[pluginId][controlId] = cloneValue(value);
  }

  function parseQuery(search) {
    const query = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const parameters = {};
    for (const [key, raw] of query.entries()) {
      if (!key.startsWith('param.')) continue;
      const encodedKey = key.slice('param.'.length);
      let value = raw;
      try { value = JSON.parse(raw); } catch (_error) { /* retain legacy scalar text */ }
      setParameter(parameters, encodedKey, value);
    }
    const scenarioId = query.get('scenario') || null;
    const seed = query.get('seed') || null;
    const mission = query.get('mission') || null;
    const hasSimulation = Boolean(scenarioId || seed || mission || Object.keys(parameters).length);
    if (!hasSimulation) return null;
    const simulation = {
      scenarioId,
      seed,
      parameters: Object.freeze(Object.fromEntries(Object.entries(parameters).map(([pluginId, values]) => [pluginId, Object.freeze(values)]))),
    };
    if (mission) simulation.mission = mission;
    return Object.freeze(simulation);
  }

  function optionalIdentifier(query, key) {
    const value = query.get(key);
    if (!value) return null;
    if (!ID_PATTERN.test(value)) throw routeError(`route_${key}_invalid`, `Invalid ${key} identity ${value}`);
    return value;
  }

  function parseRouteQuery(search, experience) {
    const query = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const world = optionalIdentifier(query, 'world');
    const profile = optionalIdentifier(query, 'profile') || experience || null;
    const requestedCamera = query.get('camera') || null;
    if (requestedCamera && !CAMERA_MODES.has(requestedCamera)) throw routeError('route_camera_invalid', `Invalid camera mode ${requestedCamera}`);
    const camera = requestedCamera === 'bird' ? 'overview' : requestedCamera;
    if (experience && profile && experience !== profile) {
      throw routeError('route_profile_mismatch', `Experience ${experience} does not match profile ${profile}`);
    }
    return { world, profile, camera, simulation: parseQuery(search) };
  }

  function normalizeSimulation(simulation) {
    if (!simulation || typeof simulation !== 'object') return null;
    const scenario = simulation.scenario && typeof simulation.scenario === 'object' ? simulation.scenario : null;
    const scenarioId = simulation.scenarioId || scenario?.id || null;
    const seed = simulation.seed || scenario?.seed || null;
    const mission = simulation.mission || null;
    const parameters = simulation.parameters && typeof simulation.parameters === 'object' && !Array.isArray(simulation.parameters)
      ? simulation.parameters
      : {};
    if (!scenarioId && !seed && !mission && !Object.keys(parameters).length) return null;
    return { scenarioId, seed, mission, parameters };
  }

  function queryForSimulation(simulation) {
    const normalized = normalizeSimulation(simulation);
    if (!normalized) return '';
    const query = new URLSearchParams();
    if (normalized.scenarioId) query.set('scenario', normalized.scenarioId);
    if (normalized.seed) query.set('seed', normalized.seed);
    if (normalized.mission) query.set('mission', normalized.mission);
    Object.entries(normalized.parameters)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([pluginId, values]) => Object.entries(values || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .forEach(([controlId, value]) => {
          if (value === undefined) return;
          query.set(`param.${pluginId}.${controlId}`, JSON.stringify(value));
        }));
    const text = query.toString();
    return text ? `?${text}` : '';
  }

  function queryForRoute(route) {
    const query = new URLSearchParams();
    if (route.world) query.set('world', route.world);
    if (route.profile || route.experience) query.set('profile', route.profile || route.experience);
    if (route.camera) query.set('camera', route.camera === 'bird' ? 'overview' : route.camera);
    const simulationQuery = queryForSimulation(route.simulation);
    const simulation = new URLSearchParams(simulationQuery.replace(/^\?/, ''));
    simulation.forEach((value, key) => query.set(key, value));
    const text = query.toString();
    return text ? `?${text}` : '';
  }

  function decodeSegment(segment) {
    try { return decodeURIComponent(segment); } catch (_error) { return segment; }
  }

  function parsePath(pathname, search = '') {
    const parts = String(pathname || '/').split('/').filter(Boolean).map(decodeSegment);
    if (!parts.length || !TIER_SET.has(parts[0])) return { tier: null, experience: null, world: null, profile: null, camera: null, simulation: null };
    const experience = parts[1] || null;
    if (experience && !ID_PATTERN.test(experience)) throw routeError('route_experience_invalid', `Invalid experience identity ${experience}`);
    return { tier: parts[0], experience, ...parseRouteQuery(search, experience) };
  }

  function hrefFor(route) {
    if (!route || !route.tier || !TIER_SET.has(route.tier)) return '/';
    const tier = encodeURIComponent(route.tier);
    const path = route.experience ? `/${tier}/${encodeURIComponent(route.experience)}` : `/${tier}`;
    return `${path}${queryForRoute(route)}`;
  }

  function routeError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  // A router instance binds the URL to a single onRoute handler. navigate() adds a history entry
  // and re-renders; canonicalize() rewrites the current entry in place (used to fill in a
  // resolved default experience) without adding history; popstate re-renders from the URL.
  function createRouter(view) {
    const target = view || (typeof window !== 'undefined' ? window : null);
    if (!target) throw new Error('simulatte_router_requires_window');
    let onRoute = null;

    function currentRoute() { return parsePath(target.location.pathname, target.location.search); }
    function dispatch(meta) { return onRoute ? onRoute(currentRoute(), meta || {}) : undefined; }

    function navigate(route, { replace = false } = {}) {
      const href = hrefFor(route);
      if (href === `${target.location.pathname}${target.location.search}`) return Promise.resolve();
      target.history[replace ? 'replaceState' : 'pushState']({}, '', href);
      return Promise.resolve(dispatch({ viaPopstate: false }));
    }

    function canonicalize(route) {
      const href = hrefFor(route);
      if (href !== `${target.location.pathname}${target.location.search}`) target.history.replaceState({}, '', href);
    }

    function start(handler) {
      onRoute = handler;
      target.addEventListener('popstate', () => { void dispatch({ viaPopstate: true }); });
      return Promise.resolve(dispatch({ viaPopstate: false, initial: true }));
    }

    return Object.freeze({ TIERS, parsePath, hrefFor, currentRoute, navigate, canonicalize, start });
  }

  return Object.freeze({ TIERS, CAMERA_MODES, parsePath, parseQuery, parseRouteQuery, normalizeSimulation, queryForSimulation, queryForRoute, hrefFor, createRouter });
});
