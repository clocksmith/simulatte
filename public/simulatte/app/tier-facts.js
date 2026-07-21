(function attachTierFacts(root, factory) {
  const api = factory();
  root.SimulatteTierFacts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierFacts() {
  // HUD stat formatting for the space scales. Pure given the tier's factual metadata
  // (from cache/space/*-facts.json) plus the small amount of live runtime state the
  // caller passes in (loaded body/star counts, current interval/magnitude cutoff).
  // Missing facts degrade every field to 'Unknown' so the caller stays non-blocking.
  function extractSolarSystemStats(facts, { bodyCount = 0, interval = 'Unavailable' } = {}) {
    const bodyFacts = facts?.facts || {};
    const planetFacts = bodyFacts.bodies || {};
    const sunFacts = bodyFacts.sun || {};
    const oort = bodyFacts.outerBoundary || {};
    const milkyWayOrbit = bodyFacts.MilkyWayOrbit || {};
    const planetProperties = Array.isArray(bodyFacts.planetProperties) ? bodyFacts.planetProperties : [];
    const planetLabels = planetProperties.slice(0, 9).map((entry) => `${entry.name} ${entry.diameterKm ? `(${entry.diameterKm} km)` : ''}`).join(', ');

    return {
      'Source': facts?.source || 'NASA / JPL Horizons',
      'Bodies': bodyCount,
      'Planets': planetFacts.planets || 'Unknown',
      'Dwarf Planets (named)': planetFacts.officiallyNamedDwarfPlanets || 'Unknown',
      'Known moons': planetFacts.knownMoons || 'Unknown',
      'Sun mass share': Number.isFinite(sunFacts.massSharePercent) ? `${sunFacts.massSharePercent}%` : 'Unknown',
      'System age': Number.isFinite(bodyFacts.ageBillionYears) ? `${bodyFacts.ageBillionYears} B yrs` : 'Unknown',
      'Milky Way orbit': milkyWayOrbit.periodYears ? `${milkyWayOrbit.periodYears.toLocaleString()} years` : 'Unknown',
      'Oort Cloud (AU)': oort.distanceAU ? `${oort.distanceAU.min?.toLocaleString()} - ${oort.distanceAU.max?.toLocaleString()}` : 'Unknown',
      'Planet quick list': planetLabels || 'Unavailable',
      'Interval': interval || 'Unavailable'
    };
  }

  function extractUniverseStats(facts, { visibleStars = 0, magnitudeCutoff = null } = {}) {
    const universeFacts = facts?.facts || {};
    const milkyWay = universeFacts.milkyWay || {};
    const galaxies = universeFacts.galaxies || {};
    const nearest = milkyWay.nearestMajorGalaxy || {};
    return {
      'Source': universeFacts.source || facts?.source || 'NASA',
      'Visible stars loaded': visibleStars,
      'Catalog': 'HYG Star Database',
      'Magnitude cutoff': magnitudeCutoff != null ? `${magnitudeCutoff}` : 'Unknown',
      'Universe age': Number.isFinite(universeFacts.universeAgeBillionYears) ? `${universeFacts.universeAgeBillionYears} B yrs` : 'Unknown',
      'Solar-system age': Number.isFinite(universeFacts.solarSystemAgeBillionYears) ? `${universeFacts.solarSystemAgeBillionYears} B yrs` : 'Unknown',
      'Milky Way stars (est)': milkyWay.estimatedStars || 'Unknown',
      'Nearest major galaxy': nearest.name ? `${nearest.name} (${nearest.distanceMillionLy} million ly)` : 'Unknown',
      'Estimated galaxies': galaxies.estimatedObservableCount || 'Unknown',
      'Observable size': universeFacts.observableUniverseSizeLy ? `${universeFacts.observableUniverseSizeLy.toLocaleString()} ly` : 'Unknown'
    };
  }

  return { extractSolarSystemStats, extractUniverseStats };
});
