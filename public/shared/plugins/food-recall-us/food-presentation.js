(function attachFoodRecallPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFoodRecallPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallPresentation() {
  // Builds the national geospatial presentation (v3) and the declarative UI views for a
  // run result (TODO_PLUGINS §13). Rendering distinguishes CONFIRMED contamination from
  // SIMULATED/SUSPECTED risk with different tones — never the same colour for both — and
  // every view is traceable to the run receipt or a governed dataset.
  const TONE = Object.freeze({ confirmed: 'red', suspected: 'amber', clean: 'cyan', recall: 'magenta', zone: 'violet' });

  function facilityStatus(facility, run) {
    const contaminated = run.lots.some((lot) => lot.contaminated && lot.tlcId.includes(`:${facility.id}:`));
    if (contaminated) return 'confirmed';
    const suspected = run.traceback.some((row) => row.facilityId === facility.id && row.score > 0);
    return suspected ? 'suspected' : 'clean';
  }

  function buildPresentation({ run, facilities, corridors, consumerZones }) {
    const facilityById = new Map(facilities.map((row) => [row.id, row]));
    const geoMarkers = facilities.slice(0, 900).map((facility) => {
      const status = facilityStatus(facility, run);
      return {
        id: `facility-${facility.id.replace(/[^a-z0-9]+/gi, '-')}`,
        label: `${facility.label} (${status})`,
        longitude: facility.location.longitude, latitude: facility.location.latitude,
        // Sizes are in the national world's planar units (~kilometres); the scene is
        // ~5000 units wide, so a marker is tens of units, not raw metres.
        tone: TONE[status], heightM: status === 'confirmed' ? 90 : 40,
        radiusM: status === 'confirmed' ? 55 : 28,
        intensity: status === 'confirmed' ? 1.8 : status === 'suspected' ? 1.1 : 0.5,
      };
    });
    const geoPaths = corridors.slice(0, 500).map((corridor, index) => {
      const from = facilityById.get(corridor.fromFacilityId);
      const to = facilityById.get(corridor.toFacilityId);
      if (!from || !to) return null;
      const contaminatedRoute = facilityStatus(from, run) === 'confirmed' || facilityStatus(to, run) === 'confirmed';
      return {
        id: `corridor-${index}`, label: `${from.label} → ${to.label}`,
        coordinates: [
          { longitude: from.location.longitude, latitude: from.location.latitude },
          { longitude: to.location.longitude, latitude: to.location.latitude },
        ],
        tone: contaminatedRoute ? TONE.confirmed : TONE.clean,
        widthM: contaminatedRoute ? 16 : 7,
        intensity: contaminatedRoute ? 1.5 : 0.5,
      };
    }).filter(Boolean);
    // Choropleth: estimated illnesses per consumer zone (proportional allocation).
    const perZone = run.trueIllnesses / Math.max(1, consumerZones.length);
    const choropleths = consumerZones.slice(0, 60).map((zone) => {
      const value = Number((perZone * (0.5 + (zone.population / 5000000))).toFixed(1));
      return {
        id: `zone-${zone.id.replace(/[^a-z0-9]+/gi, '-')}`, label: `${zone.state}: ~${value} est. illnesses`,
        ring: zoneRing(zone.location.longitude, zone.location.latitude),
        value, tone: value > perZone ? TONE.suspected : TONE.zone,
        intensity: Math.min(2, 0.4 + value / Math.max(1, perZone)),
      };
    });
    return {
      schema: 'simulatte.pluginPresentation.v3',
      markers: [], paths: [], actors: [],
      geoMarkers, geoPaths, geoAreas: [], choropleths,
      geoCameraTargets: [
        // Distance is in the national world's planar units (~km); ~9000 frames the
        // continental extent from a top-down camera.
        { id: 'us-food-network', label: 'National food network', longitude: -98.58, latitude: 39.83, distanceM: 9000 },
      ],
      cameraTargets: [],
    };
  }

  // A small diamond ring around a zone centroid so the choropleth cell is a valid polygon.
  function zoneRing(longitude, latitude) {
    const d = 1.6;
    return [
      { longitude: longitude - d, latitude }, { longitude, latitude: latitude + d },
      { longitude: longitude + d, latitude }, { longitude, latitude: latitude - d },
    ];
  }

  function buildViews({ run, scenario, datasetReceipts, activeIntervention }) {
    const inspector = {
      slot: 'inspector', title: `Food recall — ${scenario.label}`,
      rows: [
        { label: 'Scenario kind', value: `${run.scenarioKind} · seed ${run.seed}` },
        { label: 'Lots / events', value: `${run.lotCount} lots · ${run.eventCount} events` },
        { label: 'True illnesses', value: String(run.trueIllnesses) },
        { label: 'Observed cases', value: String(run.observedCases) },
        { label: 'Detection', value: run.detectionDay ? `day ${run.detectionDay}` : 'not detected' },
        { label: 'True source rank', value: run.trueSourceRank ? `#${run.trueSourceRank}` : 'unranked' },
        ...(run.recall ? [
          { label: 'Recall sensitivity', value: fmtPct(run.recall.recallSensitivity) },
          { label: 'Recall precision', value: fmtPct(run.recall.recallPrecision) },
          { label: 'Safe-food waste', value: `${run.recall.safeFoodWasteUnits} units` },
          { label: 'Cases averted', value: String(run.recall.casesAverted) },
        ] : []),
      ],
      fields: [
        { id: 'recallDay', label: 'Recall day', type: 'number', value: String(activeIntervention?.dayOffset ?? scenario.defaultIntervention.dayOffset) },
        { id: 'recallDepth', label: 'Recall depth', type: 'select', value: activeIntervention?.depth ?? scenario.defaultIntervention.depth,
          options: [{ value: 'retail', label: 'Retail' }, { value: 'consumer', label: 'Consumer' }] },
      ],
      actions: [
        { id: 'recall.issue', label: 'Issue recall' },
        { id: 'counterfactual.compare', label: 'Compare vs baseline' },
        { id: 'ensemble.run', label: 'Run ensemble' },
        { id: 'focus.national', label: 'National view', command: { kind: 'camera.focus', targetId: 'us-food-network' } },
      ],
    };
    // Provenance panel (§13): scenario kind, dataset hashes, model versions, claim boundary.
    const provenance = {
      slot: 'hud', title: 'Provenance & claim boundary',
      rows: [
        { label: 'Status', value: `${run.scenarioKind} scenario` },
        { label: 'Engine', value: run.engineVersion },
        { label: 'RNG', value: run.randomStreams[0]?.algorithm || 'n/a' },
        ...datasetReceipts.slice(0, 4).map((row) => ({ label: row.id, value: `sha256 ${String(row.sha256 || '').slice(0, 10)}` })),
        { label: 'Claim boundary', value: 'Synthetic/historical scenario estimate — not a live recall alert, regulatory classification, or medical advice.' },
      ],
      actions: [],
    };
    return [inspector, provenance];
  }

  function fmtPct(value) { return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`; }

  return { buildPresentation, buildViews };
});
