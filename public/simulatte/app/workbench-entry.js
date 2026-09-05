(function attachWorkbenchEntry(root) {
  if (typeof module === 'object' && module.exports) return;
  const manifest = root.SimulatteWorldRuntimeScriptManifest;
  const loader = root.SimulatteWorldRuntimeLoader;
  if (!manifest || !loader) throw new Error('workbench_entry_dependency_missing');
  let pending = null, ready = false;
  const landing = document.getElementById('world-tiers-landing-page');
  function showLanding() {
    const data = location.hash === '#data';
    document.getElementById('simulation-home').hidden = data;
    document.getElementById('data-page').hidden = !data;
    landing.scrollTop = 0;
  }
  root.addEventListener('hashchange', showLanding);
  showLanding();
  async function loadProfiles() {
    if (ready) return;
    if (pending) return pending;
    pending = (async () => {
      const status = document.getElementById('simulation-status');
      status.textContent = 'Loading simulation';
      try {
        for (const path of manifest.profileRuntime) await loader.loadScript(path);
        ready = true;
        status.textContent = '';
      } catch (error) {
        landing.classList.remove('hidden');
        showLanding();
        status.textContent = `Could not load simulation: ${error.message}. Select it to retry.`;
        status.dataset.state = 'error';
        throw error;
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
    const card = event.target.closest('.tier-card[data-tier]');
    if (!card) return;
    event.preventDefault();
    if (ready) return;
    event.stopImmediatePropagation();
    history.pushState(null, '', `/${encodeURIComponent(card.dataset.tier)}/${encodeURIComponent(card.dataset.defaultProfile)}`);
    void loadProfiles().catch(() => {});
  }, true);
  root.addEventListener('popstate', () => {
    showLanding();
    if (!ready && location.pathname !== '/') void loadProfiles().catch(() => {});
  });
  if (location.pathname !== '/' && location.pathname !== '/index.html') void loadProfiles().catch(() => {});
  else document.body.dataset.journeyPhase = 'ready';
})(typeof globalThis !== 'undefined' ? globalThis : window);
