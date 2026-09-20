(function attachRouteRuntime(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRouteRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRouteRuntime(root) {
  function create({ landing, beforeSelect } = {}) {
    const loader = root.SimulatteWorldRuntimeLoader;
    const tiers = root.SimulatteWorldTiersBoot;
    const router = root.SimulatteRouter.createRouter(root);
    const navigate = (route, options) => router.navigate(route, options);

    async function boot(tier, profileId, options = {}) {
      await loader.loadRouteRuntime({ tierId: tier, profileId, signal: options.signal });
      if (options.signal?.aborted) throw options.signal.reason;
      if (tier === 'city') {
        return root.SimulatteAutonomyApp.start(tier, profileId, { ...options, navigate });
      }
      const view = root.SimulatteMainView;
      return tiers.bootGovernedTierExplorer({
        collectElements: view.collectElements,
        setJourneyPhase: root.SimulatteCityInterface.setJourneyPhase,
        setRuntimeStatus: view.setRuntimeStatus,
        createTierVisualizer: root.SimulatteMultiTierVisualizer.createTierVisualizer,
        navigate,
        onSelectTier: (nextTier) => navigate({ tier: nextTier, experience: null }),
      }, tier, profileId, options);
    }

    const shell = tiers.createAppShell({
      router,
      boot,
      landing,
      beforeSelect,
      documentationLink: root.document.getElementById('experience-doc-link'),
    });
    return Object.freeze({ start: () => shell.start(), navigate });
  }
  return Object.freeze({ create });
});
