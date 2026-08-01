const assert = require('node:assert/strict');
const test = require('node:test');

const cityPresentation = require('../public/simulatte/app/plugin-presentation.js');
const tierPresentation = require('../public/simulatte/app/tier-plugin-presentation.js');
const multiTierVisualizer = require('../public/simulatte/app/multi-tier-visualizer.js');
const semanticLabelOverlay = require('../public/simulatte/app/semantic-label-overlay.js');
const gpuGeometry = require('../public/simulatte/app/webgpu-geometry.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const provenanceRegistry = require('../public/simulatte/platform/runtime/provenance-registry.js');

const provenance = contracts.createProvenance({
  origin: 'simulated',
  temporalStatus: 'forecast',
  uncertainty: { kind: 'missing', value: { reason: 'fixture uncertainty' } },
  evidenceRefs: [{
    id: 'fixture:model',
    datasetId: 'fixture:dataset',
    contentHash: 'a'.repeat(64),
    modelReceiptId: 'fixture:model-receipt',
  }],
});

function semanticPresentation() {
  return {
    schema: 'simulatte.pluginPresentation.v4',
    pluginId: 'fixture',
    coordinateSystem: 'local-m',
    epoch: null,
    layers: [
      {
        id: 'flow',
        kind: 'path',
        label: 'Transfer flow',
        geometry: { kind: 'polyline', coordinateSystem: 'local-m', coordinates: [[0, 0], [100, 100]] },
        quantity: { kind: 'flow', value: 1000, unit: 'items', domain: [0, 1000] },
        role: 'primary',
        importance: 1,
        aggregationKey: null,
        temporal: null,
        provenance,
      },
      ...[0, 1, 2].map((index) => ({
        id: `hub:${index}`,
        kind: 'point',
        label: `Hub ${index}`,
        geometry: { kind: 'point', coordinateSystem: 'local-m', coordinates: [[10 + index, 10 + index]] },
        quantity: { kind: 'inventory', value: index + 1, unit: 'items', domain: [0, 10] },
        role: 'context',
        importance: 0.3,
        aggregationKey: 'hubs',
        temporal: null,
        provenance,
      })),
      {
        id: 'pressure-field',
        kind: 'field',
        label: 'Pressure field',
        geometry: {
          kind: 'polygon',
          coordinateSystem: 'local-m',
          coordinates: [[0, 0], [20, 0], [20, 20], [0, 20]],
        },
        quantity: { kind: 'pressure', value: 7, unit: 'index', domain: [0, 10] },
        role: 'context',
        importance: 0.4,
        aggregationKey: null,
        temporal: null,
        provenance,
      },
    ],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'overview',
      mode: 'overview',
      targetIds: ['flow'],
      reasonEventId: null,
      priority: 50,
      transition: 'ease',
    }],
  };
}

function provenanceReceipt(presentation) {
  const envelope = contracts.createProvenanceEnvelope({
    subjectId: 'fixture:model',
    subjectKind: 'model',
    axes: provenance.axes,
    datasetIds: ['fixture:dataset'],
    artifactSha256: 'a'.repeat(64),
    parentIds: [],
    modelReceiptId: 'fixture:model-receipt',
    scenarioEpoch: 'scenario:fixture',
    contentVersion: 'fixture-v1',
    license: { required: false, identifier: null },
  });
  return provenanceRegistry.createContributionProvenanceReceipt({
    schema: 'simulatte.pluginContribution.v4',
    pluginId: presentation.pluginId,
    presentation,
    events: [],
    controls: { schema: 'simulatte.pluginControls.v4', controls: [], comparisons: [] },
    state: null,
    inspections: [],
    provenanceRecords: [{
      schema: 'simulatte.provenanceRecord.v4',
      id: 'fixture:model',
      kind: 'model',
      datasetId: 'fixture:dataset',
      contentHash: 'a'.repeat(64),
      parentIds: [],
      metadata: {},
      envelope,
    }],
  });
}

test('City presentation consumes compositor clustering, styles, and receipts', () => {
  const presentation = semanticPresentation();
  const compiled = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment() { throw new Error('unused'); },
  }, {
    viewport: { width: 400, height: 300 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(compiled.markers.length < 3, true);
  assert.equal(compiled.markers.flatMap((row) => row.memberIds).length, 3);
  assert.equal(compiled.paths[0].style.widthPx <= 4, true);
  assert.equal(compiled.paths[0].intensity > compiled.paths[0].style.strokeOpacity, true);
  assert.equal(compiled.paths[0].provenance.axes.origin, 'simulated');
  assert.equal(compiled.compositorReceipts[0].clusterCount >= 1, true);
  assert.equal(compiled.compositorReceipts[0].representedLayerCount, 5);
  assert.equal(compiled.compositorReceipts[0].clusteredLayerCount, 2);
  assert.equal(compiled.compositorReceipts[0].policies.collisionManagedLabels, true);
  assert.equal(compiled.compositorReceipts[0].policies.cohortQuantityDomains, true);
  assert.equal(compiled.compositorReceipts[0].provenance.isCanonical, true);
  assert.deepEqual(compiled.compositorReceipts[0].provenance.unresolvedLayerIds, []);
});

test('City renderer converts compositor pixels into visible world dimensions', () => {
  const presentation = semanticPresentation();
  const compiled = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment() { throw new Error('unused'); },
  }, {
    viewport: { width: 20, height: 20 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(compiled.paths[0].widthM > compiled.paths[0].style.widthPx, true);
  assert.equal(compiled.markers[0].radiusM > compiled.markers[0].style.radiusPx, true);
  assert.equal(compiled.markers[0].heightM, compiled.markers[0].radiusM * 3);
  assert.equal(compiled.compositorReceipts[0].policies.screenSpaceWidths, true);
});

test('City expands one governed point-cloud layer into individual tiny markers', () => {
  const base = semanticPresentation();
  const presentation = {
    ...base,
    layers: [{
      ...base.layers[1],
      id: 'residences',
      label: 'Three unique residences',
      geometry: {
        kind: 'point-cloud',
        coordinateSystem: 'local-m',
        coordinates: [[0, 0], [10, 20], [30, 40]],
      },
      quantity: { kind: 'person-residences', value: 3, unit: 'residences', domain: null },
      aggregationKey: null,
      importance: 0.08,
    }],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'residence-overview',
      mode: 'overview',
      targetIds: ['residences'],
      reasonEventId: null,
      priority: 50,
      transition: 'ease',
    }],
  };
  const compiled = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment() { throw new Error('unused'); },
  }, {
    viewport: { width: 400, height: 300 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(compiled.markers.length, 3);
  assert.equal(new Set(compiled.markers.map((row) => row.id)).size, 3);
  assert.ok(compiled.markers.every((row) => row.radiusM <= 1));
  assert.deepEqual(
    compiled.markers.map((row) => [row.point.x, row.point.y]),
    [[0, 0], [10, 20], [30, 40]]
  );
});

test('City renders residence point clouds as lightweight six-vertex nodes', () => {
  const markerCount = 100;
  const scene = {
    areas: [],
    paths: [],
    markers: Array.from({ length: markerCount }, (unused, index) => ({
      point: { x: index, y: index },
      semanticKind: 'person-residences',
      tone: 'muted',
      radiusM: 0.5,
      intensity: 0.2,
    })),
    actors: [],
    choropleths: [],
    geoAreas: [],
    geoPaths: [],
    geoMarkers: [],
    sun: null,
  };
  const geometry = gpuGeometry.createDynamicGeometry({
    blockedSegmentIds: () => [],
    signalRows: () => [],
    activeActors: () => [],
  }, {
    route: { segmentIds: [] },
    state: {
      tick: 0,
      taskType: 'simulation',
      position: { x: 0, y: 0 },
      suppressPrimaryActor: true,
      simulatedTimeSeconds: 0,
    },
  }, null, [], null, scene);
  assert.equal(geometry.length / gpuGeometry.FLOATS_PER_VERTEX, markerCount * 6);
});

test('semantic volume compiles into an extruded City mesh and retains height in tier views', () => {
  const base = semanticPresentation();
  const presentation = {
    ...base,
    layers: [{
      ...base.layers[0],
      id: 'building',
      kind: 'volume',
      label: 'Building under construction',
      geometry: {
        kind: 'polygon',
        coordinateSystem: 'local-m',
        coordinates: [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
      },
      quantity: {
        kind: 'building-visible-height',
        value: 48,
        unit: 'm',
        domain: [0, 80],
      },
    }],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'building-overview',
      mode: 'overview',
      targetIds: ['building'],
      reasonEventId: null,
      priority: 80,
      transition: 'ease',
    }],
  };
  const city = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment() { throw new Error('unused'); },
  }, {
    viewport: { width: 400, height: 300 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(city.areas.length, 1);
  assert.equal(city.areas[0].isVolume, true);
  assert.equal(city.areas[0].heightM, 48);

  const writer = gpuGeometry.createWriter();
  gpuGeometry.addExtrudedPolygon(
    writer,
    city.areas[0].points,
    city.areas[0].heightM,
    gpuGeometry.PLUGIN_TONES.violet,
    0.5
  );
  const vertices = writer.finish();
  const heights = [];
  for (let offset = 0; offset < vertices.length; offset += gpuGeometry.FLOATS_PER_VERTEX) {
    heights.push(vertices[offset + 1]);
  }
  assert.equal(Math.max(...heights), 48);
  assert.ok(Math.min(...heights) <= 0.12);
  assert.ok(vertices.length / gpuGeometry.FLOATS_PER_VERTEX >= 30);

  const tier = tierPresentation.compileTierPresentation(presentation, 'local-m', {
    viewport: { width: 400, height: 300 },
    project: (position) => ({ x: position[0], y: position[1] }),
    provenanceReceipt: provenanceReceipt(presentation),
  });
  assert.equal(tier.areas[0].isVolume, true);
  assert.equal(tier.areas[0].height, 48);
});

test('City compiles a semantic actor into a moving actor mesh and camera target', () => {
  const base = semanticPresentation();
  const presentation = {
    ...base,
    layers: [{
      ...base.layers[0],
      id: 'walker',
      kind: 'actor',
      label: 'Walker',
      geometry: {
        kind: 'polyline',
        coordinateSystem: 'local-m',
        coordinates: [[0, 0], [80, 0], [80, 80]],
      },
      quantity: { kind: 'actor.pedestrian.route-progress', value: 0.25, unit: 'ratio', domain: [0, 1] },
      aggregationKey: null,
    }],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'walker-navigation',
      mode: 'follow',
      targetIds: ['walker'],
      reasonEventId: null,
      priority: 55,
      transition: 'ease',
    }],
  };
  const compiled = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment() { throw new Error('unused'); },
  }, {
    viewport: { width: 400, height: 300 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(compiled.actors.length, 1);
  assert.equal(compiled.actors[0].kind, 'pedestrian');
  assert.deepEqual(compiled.actors[0].points, [{ x: 40, y: 0 }]);
  const cameraTarget = compiled.cameraTargets.find((row) => row.id === 'plugin:fixture:walker');
  assert.deepEqual(cameraTarget.target, [40, 0, -0]);
});

test('City segment-set paths render independently without invented connector geometry', () => {
  const presentation = {
    ...semanticPresentation(),
    coordinateSystem: 'city-segment-id',
    layers: [{
      ...semanticPresentation().layers[0],
      geometry: {
        kind: 'segments',
        coordinateSystem: 'city-segment-id',
        segmentIds: ['segment-a', 'segment-b'],
      },
    }],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'overview',
      mode: 'overview',
      targetIds: ['flow'],
      reasonEventId: null,
      priority: 50,
      transition: 'ease',
    }],
  };
  const segments = new Map([
    ['segment-a', { geometry: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
    ['segment-b', { geometry: [{ x: 1000, y: 1000 }, { x: 1010, y: 1000 }] }],
  ]);
  const compiled = cityPresentation.compile([{
    pluginId: 'fixture',
    presentation,
  }], {
    world: {},
    node() { throw new Error('unused'); },
    segment(id) { return segments.get(id); },
  }, {
    viewport: { width: 400, height: 300 },
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(compiled.paths.length, 2);
  assert.deepEqual(compiled.paths.map((row) => row.points), [
    segments.get('segment-a').geometry,
    segments.get('segment-b').geometry,
  ]);
  assert.ok(compiled.paths.every((row) => row.memberIds.includes('flow')));
  assert.ok(
    compiled.paths.every((row) => row.widthM >= row.style.widthPx * Math.hypot(1010, 1000) * 1.2 / 252 * 0.999),
    'semantic widths must account for the fitted perspective camera, not only axis-aligned extent'
  );
});

test('governed tier presentation consumes the same compositor contract', () => {
  const presentation = semanticPresentation();
  const compiled = tierPresentation.compileTierPresentation(
    presentation,
    'local-m',
    {
      viewport: { width: 400, height: 300 },
      project: (position) => ({ x: position[0], y: position[1] }),
      provenanceReceipt: provenanceReceipt(presentation),
    }
  );
  assert.equal(compiled.markers.length, 1);
  assert.equal(compiled.paths[0].style.widthPx <= 4, true);
  assert.equal(compiled.choropleths[0].value, 7);
  assert.ok(compiled.labels.some((row) => row.id === 'flow' && row.label === 'Transfer flow'));
  assert.equal(compiled.compositorReceipt.clusterCount, 1);
  assert.equal(compiled.compositorReceipt.policies.screenSpaceWidths, true);
  assert.equal(compiled.compositorReceipt.provenance.isCanonical, true);
  assert.deepEqual(compiled.compositorReceipt.provenance.unresolvedLayerIds, []);
  assert.equal(compiled.compositorReceipt.representedLayerCount, 5);
  assert.equal(compiled.compositorReceipt.clusteredLayerCount, 3);
  assert.deepEqual(compiled.cameraTargets[0].bounds, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
  assert.deepEqual(compiled.cameraTargets[0].memberIds, ['flow']);
});

test('tier presentation preserves semantic actor identity and projects native 3D depth', () => {
  const base = semanticPresentation();
  const presentation = {
    ...base,
    coordinateSystem: 'heliocentric-ecliptic-au',
    layers: [{
      ...base.layers[0],
      id: 'spacecraft',
      kind: 'actor',
      geometry: {
        kind: 'polyline',
        coordinateSystem: 'heliocentric-ecliptic-au',
        coordinates: [[0, 0, 0], [1, 0.5, 0.75], [2, 1, 1.5]],
      },
      quantity: {
        kind: 'actor.spacecraft.route-progress',
        value: 0.5,
        unit: 'ratio',
        domain: [0, 1],
      },
    }],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'spacecraft-follow',
      mode: 'follow',
      targetIds: ['spacecraft'],
      reasonEventId: null,
      priority: 80,
      transition: 'ease',
    }],
  };
  const compiled = tierPresentation.compileTierPresentation(presentation, 'heliocentric-ecliptic-au', {
    viewport: { width: 400, height: 300 },
    project: (position) => tierPresentation.projectPoint(position, 'heliocentric-ecliptic-au', {
      panX: 200,
      panY: 150,
      zoom: 100,
      rotX: 0.4,
      rotY: -0.5,
    }),
    provenanceReceipt: provenanceReceipt(presentation),
  });
  assert.equal(compiled.actors[0].quantityKind, 'actor.spacecraft.route-progress');
  assert.deepEqual(compiled.actors[0].position, [1, 0.5, 0.75]);
  assert.deepEqual(compiled.cameraTargets[0].center, [1, 0.5, 0.75]);
  const flat = tierPresentation.projectPoint([1, 0.5, 0.75], 'heliocentric-ecliptic-au', {
    panX: 200,
    panY: 150,
    zoom: 100,
    rotX: 0,
    rotY: 0,
  });
  const rotated = tierPresentation.projectPoint([1, 0.5, 0.75], 'heliocentric-ecliptic-au', {
    panX: 200,
    panY: 150,
    zoom: 100,
    rotX: 0.4,
    rotY: -0.5,
  });
  assert.notEqual(rotated.x, flat.x);
  assert.notEqual(rotated.y, flat.y);
  assert.notEqual(rotated.depth, flat.depth);
});

test('tier presentation sends evidence-bound extent to the core-owned camera fitter', () => {
  const presentation = semanticPresentation();
  const calls = [];
  const layer = tierPresentation.createLayer({
    width: () => 400,
    height: () => 300,
    pan: () => {
      throw new Error('extent fitter should own this camera transition');
    },
    fit: (target, coordinateSystem) => {
      calls.push({ target, coordinateSystem });
      return true;
    },
    view: () => ({
      panX: 0,
      panY: 0,
      zoom: 1,
      currentTier: 'country',
      bounds: null,
      projectCountry: null,
    }),
  });
  layer.set([{ pluginId: 'fixture', presentation }], {
    provenanceReceipts: [provenanceReceipt(presentation)],
  });
  assert.equal(layer.focus('plugin:fixture:overview'), true);
  assert.equal(calls[0].coordinateSystem, 'local-m');
  assert.deepEqual(calls[0].target.memberIds, ['flow']);
  assert.deepEqual(calls[0].target.bounds, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
});

test('country evidence framing fills desktop and mobile viewports without clipping evidence', () => {
  const countryBounds = { minLon: -171, maxLon: -66, minLat: 18, maxLat: 72 };
  const evidenceBounds = { minX: -124, maxX: -71, minY: 25, maxY: 48 };
  [
    { width: 1440, height: 1000, minimumFraction: 0.45, maximumFraction: 0.58 },
    { width: 390, height: 844, minimumFraction: 0.65, maximumFraction: 0.84 },
  ].forEach(({ width, height, minimumFraction, maximumFraction }) => {
    const fitted = multiTierVisualizer.countryEvidenceView({
      countryBounds,
      evidenceBounds,
      width,
      height,
    });
    const scalePerZoom = Math.min(
      width / (countryBounds.maxLon - countryBounds.minLon),
      height / (countryBounds.maxLat - countryBounds.minLat)
    ) * 0.06;
    const projectedWidth = (evidenceBounds.maxX - evidenceBounds.minX) * scalePerZoom * fitted.zoom;
    assert.ok(projectedWidth >= width * minimumFraction);
    assert.ok(projectedWidth <= width * maximumFraction);
    const countryCenterX = (countryBounds.minLon + countryBounds.maxLon) / 2;
    const evidenceCenterX = (evidenceBounds.minX + evidenceBounds.maxX) / 2;
    assert.equal(
      Math.round(fitted.panX + (evidenceCenterX - countryCenterX) * scalePerZoom * fitted.zoom),
      Math.round(width / 2)
    );
  });
});

test('City semantic labels project through the camera and suppress screen collisions', () => {
  const identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  const result = semanticLabelOverlay.layout([
    { id: 'first', text: 'First', point: { x: 0, y: -0.5, heightM: 0.1 } },
    { id: 'second', text: 'Second', point: { x: 0, y: -0.5, heightM: 0.1 } },
  ], identity, { width: 400, height: 300, scale: 1 });
  assert.deepEqual(result.labels.map((row) => row.id), ['first']);
  assert.deepEqual(result.suppressedIds, ['second']);
});

function tierDrawingTrace(timeSeconds, { depthOrder = false } = {}) {
  const trace = [];
  const ctx = {
    beginPath() { trace.push(['begin']); },
    moveTo(x, y) { trace.push(['move', x, y]); },
    lineTo(x, y) { trace.push(['line', x, y]); },
    setLineDash(value) { trace.push(['dash', ...value]); },
    stroke() { trace.push(['stroke']); },
    fill() { trace.push(['fill']); },
    arc(x, y, radius) { trace.push(['arc', x, y, radius]); },
  };
  tierPresentation.draw(ctx, [{
    pluginId: 'fixture',
    coordinateSystem: 'local-m',
    areas: [],
    choropleths: [],
    paths: [{
      id: 'flow',
      coordinates: [[0, 0, depthOrder ? 5 : 0], [100, 0, depthOrder ? 5 : 0]],
      quantityKind: depthOrder ? 'static-line' : 'cargo-flow',
      tone: 'cool',
      style: { widthPx: 2, strokeOpacity: 0.8, dash: [] },
    }],
    markers: [{
      id: 'failure',
      position: [10, 10, depthOrder ? -5 : 0],
      quantityKind: 'service-failure',
      tone: 'danger',
      radius: 5,
      style: { fillOpacity: 0.9, strokeOpacity: 0.9 },
    }],
    actors: [],
    labels: [],
  }], (position) => ({ x: position[0], y: position[1], depth: Number(position[2] || 0) }), {
    timeSeconds,
  });
  return trace;
}

test('tier animation is deterministic at a simulation time and changes only when time advances', () => {
  const first = tierDrawingTrace(12.5);
  const replayed = tierDrawingTrace(12.5);
  const advanced = tierDrawingTrace(13.5);
  assert.deepEqual(replayed, first);
  assert.notDeepEqual(
    advanced.filter((row) => row[0] === 'arc'),
    first.filter((row) => row[0] === 'arc'),
  );
});

test('tier primitives are painter-sorted by projected 3D depth across primitive kinds', () => {
  const trace = tierDrawingTrace(0, { depthOrder: true });
  assert.ok(trace.findIndex((row) => row[0] === 'fill') < trace.findIndex((row) => row[0] === 'move'));
});

test('tier labels remain collision-managed after camera reprojection', () => {
  const visible = [];
  const ctx = {
    measureText: (text) => ({ width: String(text).length * 7 }),
    fillRect() {},
    fillText: (text) => visible.push(text),
  };
  tierPresentation.draw(ctx, [{
    pluginId: 'fixture',
    coordinateSystem: 'local-m',
    areas: [],
    choropleths: [],
    paths: [],
    markers: [],
    actors: [],
    labels: [
      { id: 'first', label: 'First', position: [0, 0, 0] },
      { id: 'second', label: 'Second', position: [0, 0, 0] },
    ],
  }], () => ({ x: 100, y: 100, depth: 0 }), { timeSeconds: 0 });
  assert.deepEqual(visible, ['First']);
});

test('coordinate-native compare framing remains distinct from overview and follow', () => {
  const options = {
    coordinates: [[-2, -1, -0.5], [2, 1, 1.5]],
    coordinateSystem: 'heliocentric-ecliptic-au',
    width: 800,
    height: 600,
    rotX: 0.3,
    rotY: -0.4,
  };
  const overview = multiTierVisualizer.coordinateEvidenceView({ ...options, viewMode: 'overview' });
  const compare = multiTierVisualizer.coordinateEvidenceView({ ...options, viewMode: 'compare' });
  const follow = multiTierVisualizer.coordinateEvidenceView({ ...options, viewMode: 'follow' });
  assert.ok(overview.zoom > compare.zoom);
  assert.ok(compare.zoom > follow.zoom);
  assert.ok([compare.panX, compare.panY, compare.zoom].every(Number.isFinite));
});
