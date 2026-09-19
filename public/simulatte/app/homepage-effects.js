(function attachHomepageEffects(root, factory) {
  const renderer = typeof module === 'object' && module.exports
    ? require('./homepage-webgpu.js') : root.SimulatteHomepageWebGpu;
  const api = factory(root, renderer);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteHomepageEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createHomepageEffects(root, rendererApi) {
  const instances = new WeakMap();
  const IDLE_FPS = 24;
  const ACTIVE_FPS = 48;

  function create({ landing, home, field, canvas, shaderUrl }) {
    if (instances.has(landing)) return instances.get(landing);
    if (!rendererApi) throw new Error('homepage_webgpu_module_missing');
    const cards = [...field.querySelectorAll('.hex-hub, .hex-satellite')];
    if (cards.length !== 7) throw new Error('homepage_constellation_requires_seven_cells');
    const style = root.getComputedStyle(home);
    const duration = Number(style.getPropertyValue('--home-launch-ms').trim());
    const ink = style.getPropertyValue('--home-fx-ink').trim().split(/\s+/).map(Number);
    if (!Number.isFinite(duration) || duration < 0 || duration > 1000
      || ink.length !== 3 || ink.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error('homepage_presentation_tokens_invalid');
    }
    const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = root.matchMedia('(forced-colors: active)');
    const events = new AbortController();
    let gpu = null, gpuAbort = null, frame = 0, epoch = 0;
    let visible = false, disposed = false, needsMeasure = true, lastFrame = 0;
    let bounds = null, cells = [], active = -1, hoverAmount = 0;
    let pointer = [-1000, -1000], launchIndex = -1, launchStart = 0;
    let launchTimer = null, launchResolve = null;
    const on = (target, name, handler) => target.addEventListener(name, handler, { signal: events.signal });

    function releaseGpu() {
      epoch += 1;
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0;
      gpuAbort?.abort();
      gpuAbort = null;
      gpu?.destroy();
      gpu = null;
      canvas.hidden = true;
      home.dataset.effectsBackend = 'css';
    }
    function fallback(error) {
      releaseGpu();
      home.dataset.effectsStatus = 'fallback';
      home.dataset.effectsReason = error.message;
    }
    function measure() {
      bounds = field.getBoundingClientRect();
      cells = cards.map(card => {
        const rect = card.getBoundingClientRect();
        return [rect.left - bounds.left + rect.width / 2, rect.top - bounds.top + rect.height / 2, rect.width, rect.height];
      });
      needsMeasure = false;
    }
    function draw(now) {
      frame = 0;
      if (!visible || !gpu || disposed) return;
      const fps = active >= 0 || launchIndex >= 0 ? ACTIVE_FPS : IDLE_FPS;
      if (now - lastFrame >= 1000 / fps) {
        const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
        lastFrame = now;
        if (needsMeasure) measure();
        hoverAmount += ((active >= 0 ? 1 : 0) - hoverAmount) * (1 - Math.exp(-elapsed * 12));
        try {
          gpu.render({ width: bounds.width, height: bounds.height, cells,
            time: now / 1000, pointer, hoverIndex: active, hoverAmount,
            launchIndex, launchProgress: launchIndex >= 0 ? Math.min(1, (now - launchStart) / Math.max(1, duration)) : 0,
            ink });
          canvas.hidden = false;
          home.dataset.effectsBackend = 'webgpu';
          home.dataset.effectsStatus = 'rendering';
        } catch (error) { fallback(error); return; }
      }
      frame = root.requestAnimationFrame(draw);
    }
    async function startGpu() {
      if (!visible || disposed || gpuAbort) return;
      if (reduced.matches || contrast.matches) {
        home.dataset.effectsStatus = 'static';
        home.dataset.effectsReason = reduced.matches ? 'reduced-motion' : 'forced-colors';
        return;
      }
      const controller = new AbortController();
      gpuAbort = controller;
      const generation = ++epoch;
      home.dataset.effectsStatus = 'initializing';
      try {
        const renderer = await rendererApi.create({ canvas, shaderUrl, signal: controller.signal,
          onFailure: error => { if (generation === epoch) fallback(error); } });
        if (generation !== epoch || !visible || disposed) { renderer.destroy(); return; }
        gpu = renderer;
        needsMeasure = true;
        lastFrame = 0;
        delete home.dataset.effectsReason;
        frame = root.requestAnimationFrame(draw);
      } catch (error) {
        if (generation === epoch && !controller.signal.aborted) fallback(error);
      }
    }
    function reset() {
      if (launchTimer !== null) root.clearTimeout(launchTimer);
      launchTimer = null;
      launchResolve?.(false);
      launchResolve = null;
      launchIndex = -1;
      active = -1;
      hoverAmount = 0;
      cards.forEach(card => { delete card.dataset.launching; delete card.dataset.active; });
      home.dataset.homeState = 'idle';
      home.removeAttribute('aria-busy');
      needsMeasure = true;
    }
    function syncVisibility() {
      const next = !disposed && !home.hidden && !landing.classList.contains('hidden') && !root.document.hidden;
      if (next === visible) return;
      visible = next;
      reset();
      if (visible) void startGpu();
      else { releaseGpu(); home.dataset.effectsStatus = 'paused'; }
    }
    function activate(index) {
      if (launchIndex >= 0) return;
      active = index;
      cards.forEach((card, at) => { if (at === index) card.dataset.active = 'true'; else delete card.dataset.active; });
      home.dataset.homeState = index >= 0 ? 'hover' : 'idle';
    }
    function launch(card) {
      if (disposed || !visible || launchIndex >= 0) return Promise.resolve(false);
      const index = cards.indexOf(card);
      if (index < 0) return Promise.resolve(false);
      if (needsMeasure) measure();
      launchIndex = index;
      launchStart = root.performance.now();
      home.dataset.homeState = 'launching';
      home.setAttribute('aria-busy', 'true');
      card.dataset.launching = 'true';
      return new Promise(resolve => {
        launchResolve = resolve;
        launchTimer = root.setTimeout(() => {
          launchTimer = null;
          launchResolve = null;
          home.dataset.homeState = 'loading';
          // The simulation receives the device budget, not a competing decorative render loop.
          releaseGpu();
          resolve(true);
        }, reduced.matches ? 0 : duration);
      });
    }
    function close() {
      if (disposed) return;
      disposed = true;
      visible = false;
      reset();
      releaseGpu();
      events.abort();
      resize.disconnect();
      visibility.disconnect();
      instances.delete(landing);
    }
    cards.forEach((card, index) => {
      on(card, 'pointerenter', () => activate(index));
      on(card, 'pointerleave', () => activate(cards.indexOf(root.document.activeElement)));
      on(card, 'focus', () => activate(index));
      on(card, 'blur', () => activate(-1));
      on(card, 'pointermove', event => {
        if (launchIndex >= 0) return;
        const rect = card.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        pointer = [event.clientX - fieldRect.left, event.clientY - fieldRect.top];
        card.style.setProperty('--light-x', `${((event.clientX - rect.left) / rect.width * 100).toFixed(1)}%`);
        card.style.setProperty('--light-y', `${((event.clientY - rect.top) / rect.height * 100).toFixed(1)}%`);
      });
    });
    const resize = new root.ResizeObserver(() => { needsMeasure = true; });
    resize.observe(field);
    const visibility = new root.MutationObserver(syncVisibility);
    visibility.observe(landing, { attributes: true, attributeFilter: ['class'] });
    visibility.observe(home, { attributes: true, attributeFilter: ['hidden'] });
    on(root.document, 'visibilitychange', syncVisibility);
    on(reduced, 'change', () => { releaseGpu(); void startGpu(); });
    on(contrast, 'change', () => { releaseGpu(); void startGpu(); });
    on(root, 'pagehide', event => {
      if (!event.persisted) close();
      else { visible = false; reset(); releaseGpu(); }
    });
    on(root, 'pageshow', syncVisibility);
    const api = Object.freeze({ launch, reset, close });
    instances.set(landing, api);
    home.dataset.effectsBackend = 'css';
    home.dataset.homeState = 'idle';
    syncVisibility();
    return api;
  }
  return Object.freeze({ create, forLanding: landing => instances.get(landing) });
});
