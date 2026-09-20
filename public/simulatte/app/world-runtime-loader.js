(function attachWorldRuntimeLoader(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldRuntimeLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldRuntimeLoader(root) {
  const loaded = new Map();
  const preloads = new Map();
  const build = root.document?.querySelector('meta[name="simulatte-build"]')?.content || null;
  for (const script of Array.from(root.document?.scripts || [])) {
    if (!script.src) continue;
    const url = new URL(script.src, root.document.baseURI);
    const base = new URL(root.document.baseURI);
    if (url.origin === base.origin) {
      loaded.set(url.href, {
        promise: Promise.resolve(url.href),
        integrity: script.integrity || null,
        state: 'ready',
        reuseCount: 0,
      });
    }
  }

  function manifest() {
    const value = root.SimulatteWorldRuntimeScriptManifest;
    if (!value) throw new Error('world_runtime_script_manifest_missing');
    return value;
  }

  function registry() {
    const value = root.SimulatteGeneratedPluginRegistry;
    if (!value) throw new Error('world_plugin_registry_missing');
    return value;
  }

  function scriptUrl(path) {
    const url = new URL(path, root.document?.baseURI || 'http://localhost/');
    if (build) url.searchParams.set('v', build);
    return url.href;
  }

  function hexIntegrityToSri(value) {
    const hex = String(value || '').replace(/^sha384-/, '');
    if (!/^[a-f0-9]{96}$/i.test(hex)) throw new Error('world_plugin_script_integrity_invalid');
    let bytes = '';
    for (let index = 0; index < hex.length; index += 2) {
      bytes += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return `sha384-${root.btoa(bytes)}`;
  }

  function pluginScripts(pluginId) {
    const entry = registry().entry(pluginId);
    if (!entry) throw new Error(`world_plugin_unknown: ${pluginId}`);
    const base = `shared/plugins/${pluginId}/`;
    return Object.freeze([
      ...(entry.manifest.resources || [])
        .filter((resource) => resource.path.endsWith('.js'))
        .map((resource) => Object.freeze({
          path: `${base}${resource.path.replace(/^\.\//, '')}`,
          integrity: hexIntegrityToSri(resource.integrity),
        })),
      Object.freeze({
        path: `${base}${entry.manifest.entry.path.replace(/^\.\//, '')}`,
        integrity: hexIntegrityToSri(entry.manifest.entry.integrity),
      }),
    ]);
  }

  function assertIntegrity(entry, integrity, url) {
    if (entry.integrity !== integrity) {
      throw new Error(`world_runtime_script_identity_conflict: ${url}`);
    }
  }

  function preloadScript(path, integrity = null) {
    if (!root.document?.createElement || !root.document?.head?.appendChild) return;
    const link = root.document.createElement('link');
    if (!link || typeof link.remove !== 'function') return;
    const url = scriptUrl(path);
    const existing = loaded.get(url) || preloads.get(url);
    if (existing) {
      assertIntegrity(existing, integrity, url);
      return;
    }
    link.rel = 'preload';
    link.as = 'script';
    link.href = url;
    if (integrity) {
      link.integrity = integrity;
      link.crossOrigin = 'anonymous';
    }
    preloads.set(url, { link, integrity });
    root.document.head.appendChild(link);
  }

  function releasePreload(url) {
    preloads.get(url)?.link.remove?.();
    preloads.delete(url);
  }

  function loadScript(path, integrity = null) {
    const url = scriptUrl(path);
    const existing = loaded.get(url);
    if (existing) {
      assertIntegrity(existing, integrity, url);
      existing.reuseCount += 1;
      return existing.promise;
    }
    if (preloads.has(url)) assertIntegrity(preloads.get(url), integrity, url);
    const script = root.document.createElement('script');
    script.src = url;
    script.async = false;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
    const entry = { integrity, state: 'loading', reuseCount: 0, promise: null };
    entry.promise = new Promise((resolve, reject) => {
      script.addEventListener('load', () => {
        entry.state = 'ready';
        releasePreload(url);
        resolve(url);
      }, { once: true });
      script.addEventListener('error', () => {
        loaded.delete(url);
        releasePreload(url);
        script.remove();
        reject(new Error(`world_runtime_script_load_failed: ${path}`));
      }, { once: true });
    });
    loaded.set(url, entry);
    root.document.head.appendChild(script);
    return entry.promise;
  }

  function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    throw signal.reason || Object.assign(new Error('World runtime load cancelled'), { name: 'AbortError' });
  }

  async function loadScripts(scripts, options = {}) {
    throwIfAborted(options.signal);
    const descriptors = scripts.map((script) => typeof script === 'string' ? { path: script, integrity: null } : script);
    const reused = descriptors.filter(({ path }) => loaded.has(scriptUrl(path))).length;
    // Fetch only this destination's dependencies together; evaluate in declared order.
    descriptors.forEach(({ path, integrity }) => preloadScript(path, integrity || null));
    for (let index = 0; index < descriptors.length; index += 1) {
      throwIfAborted(options.signal);
      const script = descriptors[index];
      await loadScript(script.path, script.integrity || null);
      throwIfAborted(options.signal);
      options.onProgress?.({ completed: index + 1, total: descriptors.length, path: script.path });
    }
    return Object.freeze({ scripts: Object.freeze(descriptors.map((script) => script.path)), reused });
  }

  async function loadSelectedProduct(options = {}) {
    const pluginIds = manifest().pluginIdsForSelection(options);
    const scripts = pluginIds.flatMap(pluginScripts);
    const result = await loadScripts(scripts, options);
    return Object.freeze({ pluginIds, ...result });
  }

  async function loadNavigation(options = {}) {
    return loadScripts(manifest().navigation, options);
  }

  async function loadRouteRuntime(options = {}) {
    const startedAt = root.performance?.now() || 0;
    const runtime = await loadScripts(manifest().runtimeForSelection(options), options);
    const product = await loadSelectedProduct(options);
    const receipt = Object.freeze({
      schema: 'simulatte.routeRuntimeLoad.v1',
      build,
      tierId: options.tierId,
      profileId: options.profileId || manifest().tierDefaultProfile[options.tierId],
      scripts: Object.freeze([...runtime.scripts, ...product.scripts]),
      reusedScripts: runtime.reused + product.reused,
      durationMs: Math.max(0, (root.performance?.now() || 0) - startedAt),
    });
    const log = root.SimulatteAutonomyRuntimeLog || root.SimulatteRuntimeLog;
    log?.info?.('runtime.route.loaded', receipt);
    return receipt;
  }

  async function loadOptionalModel(options = {}) {
    return loadScripts(manifest().stages.optionalModel, options);
  }

  async function loadModule(path) {
    return import(scriptUrl(path));
  }

  async function loadTierModules(tierId) {
    const scripts = manifest().tierModules ? manifest().tierModules(tierId) : [];
    const result = await loadScripts(scripts);
    return Object.freeze({ tierId, ...result });
  }

  function cacheSnapshot() {
    return Object.freeze({
      schema: 'simulatte.runtimeScriptCache.v1',
      build,
      entries: Object.freeze([...loaded].map(([url, entry]) => Object.freeze({
        url, integrity: entry.integrity, state: entry.state, reuseCount: entry.reuseCount,
      }))),
    });
  }

  async function loadSelectedRuntime(options = {}) {
    if (options && options.tierId) return loadRouteRuntime(options);
    const scripts = manifest().stages.selectedRuntime || [];
    const result = await loadScripts(scripts, options);
    return Object.freeze({ scripts: result.scripts });
  }

  return Object.freeze({
    loadSelectedProduct, loadOptionalModel, loadScript, loadModule, loadTierModules,
    loadNavigation, loadRouteRuntime, loadSelectedRuntime,
    pluginScripts, cacheSnapshot,
  });
});
