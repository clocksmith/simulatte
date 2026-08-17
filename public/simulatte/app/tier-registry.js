(function attachSimulatteTierRegistry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierRegistry() {
  const TIERS = Object.freeze([
    Object.freeze({
      id: 'datacenter',
      label: 'Datacenter',
      rendererMethod: 'drawDatacenter',
      canvasVisible: true,
      initialZoom: 1.0,
    }),
    Object.freeze({
      id: 'city',
      label: 'City',
      rendererMethod: null,
      canvasVisible: false,
    }),
    Object.freeze({
      id: 'country',
      label: 'Country',
      rendererMethod: 'drawCountry',
      canvasVisible: true,
      initialZoom: 8,
    }),
    Object.freeze({
      id: 'world',
      label: 'Planet',
      rendererMethod: 'drawWorld',
      canvasVisible: true,
      initialZoom: 1.4,
    }),
    Object.freeze({
      id: 'solar-system',
      label: 'Solar System',
      rendererMethod: 'drawSolarSystem',
      canvasVisible: true,
      initialZoom: 140,
    }),
    Object.freeze({
      id: 'star-chart',
      label: 'Universe',
      rendererMethod: 'drawStarChart',
      canvasVisible: true,
      initialZoom: 280,
    }),
  ]);
  const TIER_IDS = Object.freeze(TIERS.map((tier) => tier.id));
  const TIER_BY_ID = Object.freeze(Object.fromEntries(TIERS.map((tier) => [tier.id, tier])));
  const TIER_LABELS = Object.freeze(Object.fromEntries(TIERS.map((tier) => [tier.id, tier.label])));

  function tierDefinition(tierId) {
    return TIER_BY_ID[String(tierId || '')] || null;
  }

  return Object.freeze({
    TIERS,
    TIER_IDS,
    TIER_BY_ID,
    TIER_LABELS,
    tierDefinition,
  });
});
