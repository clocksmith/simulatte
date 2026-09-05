(function attachWorkbenchEntry(root) {
  if (typeof module === 'object' && module.exports) return;
  const manifest = root.SimulatteWorldRuntimeScriptManifest;
  const loader = root.SimulatteWorldRuntimeLoader;
  if (!manifest || !loader) throw new Error('workbench_entry_dependency_missing');
  let pending = null, ready = false;
  const landing = document.getElementById('world-tiers-landing-page');
  async function loadProfiles() {
    if (ready) return;
    if (pending) return pending;
    pending = (async () => {
      const status = document.getElementById('data-status');
      status.textContent = 'Loading the selected profile runtime';
      try {
        for (const path of manifest.profileRuntime) await loader.loadScript(path);
        ready = true;
        status.textContent = 'Start with CSV, JSON records, or an exported data WorldSpec.';
      } catch (error) {
        landing.classList.remove('hidden');
        status.textContent = `Profile loading failed: ${error.message}. Select a profile to retry.`;
        status.dataset.state = 'error';
        throw error;
      } finally { pending = null; }
    })();
    return pending;
  }
  landing.addEventListener('click', (event) => {
    if (ready) return;
    const card = event.target.closest('.tier-card[data-tier]');
    if (!card) return;
    event.preventDefault(); event.stopImmediatePropagation();
    history.pushState(null, '', `/${encodeURIComponent(card.dataset.tier)}/${encodeURIComponent(card.dataset.defaultProfile)}`);
    void loadProfiles().catch(() => {});
  }, true);
  root.addEventListener('popstate', () => {
    if (!ready && location.pathname !== '/') void loadProfiles().catch(() => {});
  });
  if (location.pathname !== '/' && location.pathname !== '/index.html') void loadProfiles().catch(() => {});
  else document.body.dataset.journeyPhase = 'ready';
})(typeof globalThis !== 'undefined' ? globalThis : window);
