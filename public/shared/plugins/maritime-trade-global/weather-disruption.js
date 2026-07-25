(function attachMaritimeWeatherDisruption(root, factory) {
  const api = factory();
  root.MaritimeWeatherDisruption = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeWeatherDisruption() {
  function resolveDisruption(scenarioId, datasets = {}) {
    if (scenarioId === 'suez-closure-cape-reroute') {
      return disruption({
        id: 'suez-closure',
        speedMultiplier: 1,
        queueMultiplier: 1,
        blockedCanalId: 'canal:suez',
        affectedCorridorIds: canalCorridors(datasets.corridors, 'canal:suez'),
        trackCoordinates: [],
        maximumWindKt: null,
        evidenceRefs: ['row:global-canal-service-models-v1:canal:suez'],
        truth: truth('scenario', 'forecast', missing('Declared closure has no probability model.')),
      });
    }
    if (scenarioId === 'transpacific-panama-restriction') {
      return disruption({
        id: 'panama-capacity-restriction',
        speedMultiplier: 1,
        queueMultiplier: 2.4,
        blockedCanalId: null,
        affectedCorridorIds: canalCorridors(datasets.corridors, 'canal:panama'),
        trackCoordinates: [],
        maximumWindKt: null,
        evidenceRefs: ['row:global-canal-service-models-v1:canal:panama'],
        truth: truth('scenario', 'forecast', {
          kind: 'interval',
          value: { minimumMultiplier: 1.6, maximumMultiplier: 3.2, basis: 'Declared scenario range.' },
        }),
      });
    }
    if (scenarioId === 'north-atlantic-cyclone') {
      const track = (datasets.cyclones?.tracks || []).find((row) => row.basin === 'north-atlantic');
      return disruption({
        id: 'north-atlantic-cyclone',
        speedMultiplier: 0.72,
        queueMultiplier: 1.8,
        blockedCanalId: null,
        affectedCorridorIds: ['corridor:nlrtm-usnyc'],
        trackCoordinates: (track?.points || []).map((row) => [row.longitude, row.latitude, 0]),
        maximumWindKt: Math.max(0, ...(track?.points || []).map((row) => Number(row.maxWindKt || 0))),
        evidenceRefs: track ? [`row:ibtracs-v04r01-scenario-tracks-v1:${track.id}`] : [],
        truth: truth('scenario', 'forecast', missing('Synthetic track is climatology-shaped, not a forecast ensemble.')),
      });
    }
    return disruption({
      id: 'baseline',
      speedMultiplier: 1,
      queueMultiplier: 1,
      blockedCanalId: null,
      affectedCorridorIds: [],
      trackCoordinates: [],
      maximumWindKt: null,
      evidenceRefs: [],
      truth: truth('scenario', 'forecast', missing('Baseline assumes no exceptional disruption.')),
    });
  }

  function canalCorridors(corridors, canalId) {
    return Object.freeze((corridors?.corridors || []).filter((row) => row.canalId === canalId).map((row) => row.id).sort());
  }

  function disruption(value) {
    return Object.freeze({
      schema: 'simulatte.maritimeDisruption.v2',
      ...value,
      affectedCorridorIds: Object.freeze([...(value.affectedCorridorIds || [])]),
      trackCoordinates: Object.freeze((value.trackCoordinates || []).map((row) => Object.freeze([...row]))),
      evidenceRefs: Object.freeze([...(value.evidenceRefs || [])]),
    });
  }

  function missing(reason) {
    return { kind: 'missing', value: { reason } };
  }

  function truth(origin, temporalStatus, uncertainty) {
    return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) });
  }

  return Object.freeze({ resolveDisruption });
});
