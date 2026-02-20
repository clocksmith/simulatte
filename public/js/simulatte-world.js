(() => {
  const CORE_SRC = './js/simulatte-world-core.js';
  const RENDER_SRC = './js/simulatte-world-rendering.js';

  function scriptAlreadyPresent(src) {
    const needle = src.replace('./', '/');
    return Array.from(document.scripts).some((script) => {
      const current = script.getAttribute('src') || '';
      return current === src || current.endsWith(needle);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (scriptAlreadyPresent(src)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.defer = true;
      script.dataset.simulatteSrc = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed loading ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureRuntime() {
    if (window.SimulatteWorldRuntime && typeof window.SimulatteWorldRuntime.start === 'function') {
      return window.SimulatteWorldRuntime;
    }

    await loadScript(CORE_SRC);
    await loadScript(RENDER_SRC);

    if (!window.SimulatteWorldRuntime || typeof window.SimulatteWorldRuntime.start !== 'function') {
      throw new Error('SimulatteWorldRuntime not available after loading scripts');
    }
    return window.SimulatteWorldRuntime;
  }

  const api = window.SimulatteWorld && typeof window.SimulatteWorld === 'object'
    ? window.SimulatteWorld
    : {};

  api.ensureLoaded = ensureRuntime;
  api.start = async () => {
    const runtime = await ensureRuntime();
    runtime.start();
    return runtime;
  };
  api.isStarted = () =>
    Boolean(
      window.SimulatteWorldRuntime &&
        typeof window.SimulatteWorldRuntime.isStarted === 'function' &&
        window.SimulatteWorldRuntime.isStarted()
    );

  window.SimulatteWorld = api;

  api.start().catch((error) => {
    console.error('[simulatte.world] boot failed', error);
  });
})();
