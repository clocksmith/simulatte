(function attachFoodRecallPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFoodRecallPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallPresentation() {
  // Builds the national geospatial presentation (v3) and the declarative UI views for a
  // run result. Presentation terms preserve the simulation boundary and every view is
  // traceable to the run receipt or a governed dataset.
  const TONE = Object.freeze({ simulated: 'red', suspected: 'amber', clean: 'cyan', recall: 'magenta', zone: 'violet' });

  function facilityStatus(facility, run) {
    const contaminated = run.lots.some((lot) => lot.contaminated && lot.tlcId.includes(`:${facility.id}:`));
    if (contaminated) return 'simulated';
    const suspected = run.traceback.some((row) => row.facilityId === facility.id && row.score > 0);
    return suspected ? 'suspected' : 'clean';
  }

  function buildPresentation({ run, facilities, corridors, consumerZones }) {
    const facilityById = new Map(facilities.map((row) => [row.id, row]));
    const activeCorridorIds = activeCorridors(run);
    const geoMarkers = facilities.slice(0, 900).map((facility) => {
      const status = facilityStatus(facility, run);
      return {
        id: `facility-${facility.id.replace(/[^a-z0-9]+/gi, '-')}`,
        label: facilityLabel(facility, status),
        longitude: facility.location.longitude, latitude: facility.location.latitude,
        tone: TONE[status], heightM: status === 'simulated' ? 90 : 32,
        radiusM: status === 'simulated' ? 7 : 3,
        intensity: status === 'simulated' ? 1.8 : status === 'suspected' ? 1.1 : 0.5,
      };
    });
    const geoPaths = corridors.filter((corridor) => activeCorridorIds.has(corridor.id)).map((corridor, index) => {
      const from = facilityById.get(corridor.fromFacilityId);
      const to = facilityById.get(corridor.toFacilityId);
      if (!from || !to) return null;
      const contaminatedRoute = facilityStatus(from, run) === 'simulated' || facilityStatus(to, run) === 'simulated';
      return {
        id: `corridor-${index}`, label: `${from.label} → ${to.label}`,
        coordinates: [
          { longitude: from.location.longitude, latitude: from.location.latitude },
          { longitude: to.location.longitude, latitude: to.location.latitude },
        ],
        tone: contaminatedRoute ? TONE.simulated : TONE.clean,
        widthM: contaminatedRoute ? 3 : 1,
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
    const d = 0.65;
    return [
      { longitude: longitude - d, latitude }, { longitude, latitude: latitude + d },
      { longitude: longitude + d, latitude }, { longitude, latitude: latitude - d },
    ];
  }

  function activeCorridors(run) {
    return new Set((run.lineage || []).map((row) => row.corridorId).filter(Boolean));
  }

  function facilityLabel(facility, status) {
    const state = facility.location?.state || 'US';
    const kind = String(facility.facilityKind || 'facility').replaceAll('_', ' ');
    return status === 'simulated'
      ? `${state} ${kind}: simulated contamination`
      : `${state} ${kind}`;
  }

  function buildViews({ run, scenario, datasetReceipts, activeIntervention, inputContext }) {
    const inspector = {
      slot: 'inspector', title: `Food recall — ${scenario.label}`,
      rows: [
        { label: 'Scenario kind', value: `${run.scenarioKind} · seed ${run.seed}` },
        { label: 'Lots / events', value: `${run.lotCount} lots · ${run.eventCount} events` },
        { label: 'True illnesses', value: String(run.trueIllnesses) },
        { label: 'Observed cases', value: String(run.observedCases) },
        { label: 'Detection', value: run.detectionDay ? `day ${run.detectionDay}` : 'not detected' },
        { label: 'Shipment time', value: `${run.shipmentDurationHours} modeled hours` },
        { label: 'Cold-chain failures', value: `${run.refrigerationFailures} simulated events` },
        { label: 'Ambient input', value: inputContext ? `${inputContext.weather.airTemperatureC} °C · ${inputContext.weather.truth.origin}` : 'unavailable' },
        { label: 'Logistics input', value: inputContext ? `${inputContext.logistics.transitDelayHoursPrior} h delay · ${(inputContext.logistics.availabilityPrior * 100).toFixed(1)}% availability` : 'unavailable' },
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
        { id: 'focus.national', label: 'National view', command: { kind: 'camera.focus', targetId: 'food-network-overview' } },
      ],
    };
    // Provenance panel (§13): scenario metrics, dataset hashes, concise claim boundary.
    const provenance = {
      slot: 'hud', title: 'Live Simulation Metrics & Provenance',
      rows: [
        { label: 'Scenario', value: `${run.scenarioKind} · seed ${run.seed}` },
        { label: 'Illnesses / Cases', value: `${run.trueIllnesses} est. / ${run.observedCases} obs.` },
        { label: 'Detection / Recall', value: `${run.detectionDay ? 'Day ' + run.detectionDay : 'Undetected'} · ${run.recall ? fmtPct(run.recall.recallSensitivity) + ' sensitivity' : 'No recall'}` },
        { label: 'Cases Averted', value: run.recall ? `${run.recall.casesAverted} cases` : '0 cases' },
        { label: 'Input boundary', value: inputContext ? `${inputContext.weather.providerId}; ${inputContext.logistics.providerId}` : 'No input receipt' },
        { label: 'Claim boundary', value: 'Synthetic scenario estimate — not a live recall alert.' },
      ],
      actions: [],
    };
    return [inspector, provenance];
  }

  function fmtPct(value) { return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`; }

  return { buildPresentation, buildViews };
});
