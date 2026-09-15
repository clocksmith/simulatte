(function attachWorkbenchEntry(root) {
  if (typeof module === 'object' && module.exports) return;
  const manifest = root.SimulatteWorldRuntimeScriptManifest;
  const loader = root.SimulatteWorldRuntimeLoader;
  const effectsApi = root.SimulatteHomepageEffects;
  if (!manifest || !loader || !effectsApi) throw new Error('workbench_entry_dependency_missing');
  let pending = null, ready = false;
  let effects = null;
  const landing = document.getElementById('world-tiers-landing-page');
  function showLanding() {
    effects?.reset();
    const data = location.hash === '#data';
    document.getElementById('simulation-home').hidden = data;
    document.getElementById('data-page').hidden = !data;
    landing.scrollTop = 0;
  }
  root.addEventListener('hashchange', showLanding);
  showLanding();
  const shaderUrl = new URL('simulatte/app/homepage-effects.wgsl', document.baseURI);
  const build = document.querySelector('meta[name="simulatte-build"]')?.content;
  if (build) shaderUrl.searchParams.set('v', build);
  effects = effectsApi.create({
    landing,
    home: document.getElementById('simulation-home'),
    field: landing.querySelector('.hex-constellation-container'),
    canvas: document.getElementById('homepage-effects-canvas'),
    shaderUrl: shaderUrl.href,
  });
  function reportLoadFailure(error) {
    landing.classList.remove('hidden');
    showLanding();
    const status = document.getElementById('simulation-status');
    status.textContent = `Could not load simulation: ${error.message}. Select it to retry.`;
    status.dataset.state = 'error';
  }
  async function loadProfiles() {
    if (ready) return;
    if (pending) return pending;
    pending = (async () => {
      const status = document.getElementById('simulation-status');
      status.textContent = 'Loading simulation';
      delete status.dataset.state;
      try {
        for (const path of manifest.profileRuntime) await loader.loadScript(path);
        ready = true;
        status.textContent = '';
      } finally { pending = null; }
  })();
    return pending;
  }
  landing.addEventListener('keydown', (event) => {
    const card = event.target.closest('.tier-card[role="button"]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      card.click();
    }
  });
  landing.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const hub = event.target.closest('#hex-center-create');
    if (hub) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void effects.launch(hub).then((proceed) => {
        if (proceed) location.assign(hub.href);
      }).catch(reportLoadFailure);
      return;
    }
    const card = event.target.closest('.tier-card[data-tier]');
    if (!card || ready) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void effects.launch(card).then((proceed) => {
      if (!proceed) return;
      history.pushState(null, '', `/${encodeURIComponent(card.dataset.tier)}/${encodeURIComponent(card.dataset.defaultProfile)}`);
      return loadProfiles();
    }).catch(reportLoadFailure);
  }, true);
  root.addEventListener('popstate', () => {
    showLanding();
    if (!ready && location.pathname !== '/' && location.pathname !== '/index.html') void loadProfiles().catch(reportLoadFailure);
  });
  if (location.pathname !== '/' && location.pathname !== '/index.html') void loadProfiles().catch(reportLoadFailure);
  else document.body.dataset.journeyPhase = 'ready';
})(typeof globalThis !== 'undefined' ? globalThis : window);
