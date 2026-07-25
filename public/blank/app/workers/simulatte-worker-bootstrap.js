(function attachSimulatteWorkerBootstrap(root) {
  function createRuntimeLoader(options = {}) {
    const workerName = String(options.workerName || 'Worker');
    const manifestEntry = String(options.manifestEntry || '');
    const scriptPrefix = String(options.scriptPrefix || '../../');
    const search = root && root.location && root.location.search || '';
    let manifestLoadError = null;

    try {
      requireImportScripts();
      importScripts(versionedScriptPath('../runtime-script-manifest.js', search));
    } catch (error) {
      manifestLoadError = error;
    }

    const runtimeManifest = root.SimulatteRuntimeScriptManifest;
    const scriptOrder = Object.freeze(
      runtimeManifest && Array.isArray(runtimeManifest[manifestEntry])
        ? runtimeManifest[manifestEntry].map((src) => `${scriptPrefix}${src}`)
        : []
    );

    function loadScripts() {
      requireImportScripts();
      if (manifestLoadError) throw manifestLoadError;
      if (!scriptOrder.length) {
        throw new Error(`${workerName} script manifest unavailable`);
      }
      importScripts(...scriptOrder.map((script) => versionedScriptPath(script, search)));
    }

    return Object.freeze({
      loadScripts,
      scriptOrder,
    });
  }

  function requireImportScripts() {
    if (typeof importScripts !== 'function') {
      throw new Error('Worker importScripts unavailable');
    }
  }

  function versionedScriptPath(script, search = '') {
    if (!search || search === '?') return script;
    const suffix = search.startsWith('?') ? search : `?${search}`;
    return `${script}${suffix}`;
  }

  function errorMessage(error, fallback = 'Worker failed') {
    if (!error) return fallback;
    return error && error.message ? error.message : String(error);
  }

  root.SimulatteWorkerBootstrap = Object.freeze({
    createRuntimeLoader,
    errorMessage,
    versionedScriptPath,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
