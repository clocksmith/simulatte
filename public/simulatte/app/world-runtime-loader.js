(function attachWorldRuntimeLoader(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldRuntimeLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldRuntimeLoader(root) {
  const loaded = new Map();

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

  function loadScript(path, integrity = null) {
    if (loaded.has(path)) return loaded.get(path);
    const pending = new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      const build = root.document.querySelector('meta[name="simulatte-build"]')?.content;
      script.src = new URL(`./${path}${build ? `?v=${encodeURIComponent(build)}` : ''}`, root.document.baseURI).toString();
      script.async = false;
      if (integrity) {
        script.integrity = integrity;
        script.crossOrigin = 'anonymous';
      }
      script.addEventListener('load', () => resolve(path), { once: true });
      script.addEventListener('error', () => reject(new Error(`world_runtime_script_load_failed: ${path}`)), { once: true });
      root.document.head.appendChild(script);
    });
    loaded.set(path, pending);
    pending.catch(() => loaded.delete(path));
    return pending;
  }

  async function loadSelectedProduct(options = {}) {
    const pluginIds = manifest().pluginIdsForSelection(options);
    for (const pluginId of pluginIds) {
      for (const script of pluginScripts(pluginId)) await loadScript(script.path, script.integrity);
    }
    return Object.freeze({ pluginIds, scripts: Object.freeze(pluginIds.flatMap(pluginScripts).map((row) => row.path)) });
  }

  async function loadOptionalModel() {
    for (const path of manifest().stages.optionalModel) await loadScript(path);
    return Object.freeze({ scripts: manifest().stages.optionalModel });
  }

  async function loadModule(path) {
    const build = root.document?.querySelector('meta[name="simulatte-build"]')?.content;
    const url = new URL(`./${path}${build ? `?v=${encodeURIComponent(build)}` : ''}`, root.document?.baseURI || 'http://localhost/').toString();
    return import(url);
  }

  return Object.freeze({ loadSelectedProduct, loadOptionalModel, loadScript, loadModule, pluginScripts });
});

