const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const sceneProof = require('../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');
const registry = require('../public/blank/app/runtime/phase-module-registry.js');

const renderer = registry.family('webGpuRenderer');
const root = path.resolve(__dirname, '..');
const gold = JSON.parse(fs.readFileSync(
  path.join(root, 'tools/samer/simulatte-public-gold-v1.json'),
  'utf8'
));
const BROAD_DIVERSITY_PROMPTS = Object.freeze([
  'particle collider muon tracks through a detector slice with field lines',
  'mangrove roots buffering storm surge in brackish tidal channels',
  'gut microbiome colonies exchanging metabolites through intestinal folds',
  'railway dispatch across signal blocks with delayed train agents',
  'edge data center server racks recirculating heat between cooling aisles',
  'planetary rings sorting ice boulders into density waves and orbital gaps',
  'sourdough fermentation bubbles growing through a dough matrix',
  'neutrino detector in an underground water tank with phototube array',
  'protein folding with chain geometry and bond constraints',
  'volcano lava turbine beside an ice castle wall with steam',
  'robot sorts parcels with a servo gripper',
  'bird feather barbs bending airflow over a wing',
  'magnetic ferrofluid forms spikes between electromagnets',
  'acoustic waveguide carries pressure pulses through a resonant chamber',
  'a laser refracts through a glass prism into a visible spectrum',
]);

test('identity graphics atoms reach Phase 7 morphology and camera uniforms without inventing motion', () => {
  const compile = (prompt) => {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    return {
      packet,
      parts: renderer.scenePacketObjectParts(packet),
      renderData: renderer.compileSceneRenderData(packet),
    };
  };
  const dogs = compile('dogs');
  const flowers = compile('flowers');

  assert.ok(dogs.parts.length > 0);
  assert.ok(flowers.parts.length > 0);
  assert.ok(dogs.parts.every((part) => part.animationSpeed === 0));
  assert.ok(flowers.parts.every((part) => part.animationSpeed === 0));
  assert.equal(dogs.renderData.cameraState.archetype, 'subject-three-quarter');
  assert.equal(flowers.renderData.cameraState.archetype, 'close-focus');
  assert.notEqual(dogs.renderData.cameraState.zoom, flowers.renderData.cameraState.zoom);
  assert.notDeepEqual(
    dogs.parts.map((part) => [part.contourProfile, part.surfacePattern, part.accentPattern]),
    flowers.parts.map((part) => [part.contourProfile, part.surfacePattern, part.accentPattern])
  );
});

test('public gold prompts compile prompt-conditioned contours and material surfaces', () => {
  const observedContours = new Set();
  const observedSurfaces = new Set();
  const observedAccents = new Set();
  const observedAtmosphereMotifs = new Set();
  const observedLayoutStrategies = new Set();
  const observedLayoutAnchors = new Set();

  for (const row of gold.rows) {
    const spec = lab.createSpecFromPrompt(row.prompt, { allowPrototypeFallback: true });
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const parts = renderer.scenePacketObjectParts(packet);

    assert.ok(packet.entities.length > 0, `${row.prompt}: entities`);
    assert.ok(packet.entities.every((entity) => (
      entity.geometry.program.morphologyReceipt &&
      entity.geometry.program.morphologyReceipt.pass === true
    )), `${row.prompt}: every literal entity needs a passing morphology receipt`);
    assert.ok(packet.entities.every((entity) => (
      entity.layoutReceipt &&
      entity.layoutReceipt.placementStrategy &&
      Number.isInteger(entity.layoutReceipt.placementSeed) &&
      entity.layoutReceipt.initialAnchor.length === 2
    )), `${row.prompt}: every entity needs a receipted composition strategy`);
    assert.equal(packet.uniforms.atmosphere.schema, 'simulatte.sceneAtmosphereProgram.v1');
    assert.ok(packet.uniforms.atmosphere.layerCount > 0);

    for (const layer of packet.uniforms.atmosphere.layers) observedAtmosphereMotifs.add(layer.motif);
    for (const entity of packet.entities) {
      observedLayoutStrategies.add(entity.layoutReceipt.placementStrategy);
      observedLayoutAnchors.add(entity.layoutReceipt.initialAnchor.join(','));
    }
    for (const part of parts) {
      observedContours.add(part.contourProfile);
      observedSurfaces.add(part.surfacePattern);
      observedAccents.add(part.accentPattern);
      assert.equal(part.shapeParameters.length, 4);
      assert.equal(part.surfaceParameters.length, 4);
      assert.equal(part.accentParameters.length, 4);
    }
  }

  assert.ok(observedContours.size >= 12, `expected broad contour vocabulary, received ${observedContours.size}`);
  for (const required of ['bevel-box', 'leaf', 'superellipse', 'tapered-capsule', 'trapezoid']) {
    assert.ok(observedContours.has(required), `missing ${required} contour`);
  }
  for (const required of ['celestial', 'ceramic', 'fur', 'glass', 'metal', 'organic', 'wood']) {
    assert.ok(observedSurfaces.has(required), `missing ${required} surface`);
  }
  assert.ok(observedLayoutStrategies.size >= 5, 'gold prompts should compile several semantic layout strategies');
  assert.ok(observedLayoutAnchors.size >= 12, 'layout seeds should produce varied deterministic anchors');
  assert.ok(observedAccents.size >= 8, `expected broad accent vocabulary, received ${observedAccents.size}`);
  assert.ok(observedAtmosphereMotifs.size >= 4, 'gold prompts should compile distinct atmosphere motifs');
});

test('broad prompts compile diverse accents and atmospheres without losing literal morphology', () => {
  const accents = new Set();
  const motifs = new Set();

  for (const prompt of BROAD_DIVERSITY_PROMPTS) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const parts = renderer.scenePacketObjectParts(packet);

    for (const entity of packet.entities.filter((row) => row.geometry.program.literal === true)) {
      assert.equal(entity.geometry.program.morphologyReceipt.pass, true, `${prompt}: ${entity.id}`);
    }
    for (const part of parts) accents.add(part.accentPattern);
    for (const layer of packet.uniforms.atmosphere.layers) motifs.add(layer.motif);
  }

  assert.ok(accents.size >= 10, `expected at least 10 accent families, received ${accents.size}`);
  assert.ok(motifs.size >= 9, `expected at least 9 atmosphere motifs, received ${motifs.size}`);
});

test('close prompts remain deterministic while explicit materials produce distinct rendering programs', () => {
  const compile = (prompt) => {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    return {
      parts: renderer.scenePacketObjectParts(packet).map((part) => ({
        id: part.id,
        surfacePattern: part.surfacePattern,
        accentPattern: part.accentPattern,
        accentParameters: part.accentParameters,
      })),
      anchors: packet.entities.map((entity) => entity.layoutReceipt.initialAnchor),
    };
  };
  const glassA = compile('a glass robot');
  const glassB = compile('a glass robot');
  const wood = compile('a wooden robot');

  assert.deepEqual(glassA, glassB);
  assert.ok(glassA.parts.every((part) => part.surfacePattern === 'glass'));
  assert.ok(glassA.parts.every((part) => part.accentPattern === 'prism'));
  assert.ok(wood.parts.every((part) => part.surfacePattern === 'wood'));
  assert.notDeepEqual(glassA.parts, wood.parts);
});

test('Phase 7 carries morphology parameters through the storage buffer contract', () => {
  const spec = lab.createSpecFromPrompt(
    'yellow excavator beside a glass greenhouse',
    { allowPrototypeFallback: true }
  );
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const renderData = renderer.compileSceneRenderData(packet, packet.sceneKind, 'morphology-buffer');
  const first = renderData.objectParts[0];

  assert.equal(renderer.GPU_OBJECT_PART_FLOATS, 40);
  assert.equal(
    renderData.objectPartData.length,
    renderer.GPU_OBJECT_PART_CAPACITY * renderer.GPU_OBJECT_PART_FLOATS
  );
  assert.equal(renderData.objectPartData[5], first.shapeCode);
  assert.ok(Math.abs(renderData.objectPartData[24] - first.shapeParameters[0]) < 1e-6);
  assert.equal(renderData.objectPartData[28], first.surfaceCode);
  assert.ok(Math.abs(renderData.objectPartData[29] - first.surfaceParameters[0]) < 1e-6);
  assert.equal(renderData.objectPartData[32], first.accentCode);
  assert.ok(Math.abs(renderData.objectPartData[34] - first.accentParameters[1]) < 1e-6);
  assert.ok(Math.abs(renderData.objectPartData[35] - first.accentParameters[2]) < 1e-6);
  assert.ok(Math.abs(renderData.objectPartData[36] - first.accentParameters[3]) < 1e-6);
  assert.ok(renderData.morphologySubmission.contourProfileCount >= 2);
  assert.ok(renderData.morphologySubmission.surfacePatterns.includes('glass'));
  assert.ok(renderData.morphologySubmission.surfacePatterns.includes('metal'));
  assert.ok(renderData.morphologySubmission.accentPatternCount >= 2);
  assert.ok(renderData.morphologySubmission.dynamicAccentPartCount > 0);
});

test('construction graph receipts verify submitted topology without primitive diversity', () => {
  const spec = lab.createSpecFromPrompt('yellow excavator beside a glass greenhouse', {
    allowPrototypeFallback: true,
  });
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const realization = renderer.objectRealizationForScenePacket(packet, renderer.scenePacketObjectParts(packet));

  for (const row of realization.rows) {
    assert.equal(row.topologyVerified, true, `${row.identityType}: construction topology`);
    assert.equal(row.realized, true, `${row.identityType}: submitted construction realization`);
  }
});

test('non-literal field helpers do not become generic object boxes', () => {
  const spec = lab.createSpecFromPrompt(
    'neutrino detector in underground water tank with photon cones and phototube array',
    { allowPrototypeFallback: true }
  );
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const nonLiteralIds = new Set(packet.entities
    .filter((entity) => entity.geometry && entity.geometry.program.literal !== true)
    .map((entity) => entity.id));
  const objectParts = renderer.scenePacketObjectParts(packet);

  assert.ok(nonLiteralIds.has('radiation'));
  assert.ok(objectParts.length > 0);
  assert.ok(objectParts.every((part) => !nonLiteralIds.has(part.entityId)));
});

test('Phase 8 fails a visible object whose morphology is not specific enough', () => {
  const spec = lab.createSpecFromPrompt('a dog', { allowPrototypeFallback: true });
  const canvas = { width: 640, height: 360 };
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
  const renderData = renderer.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const readbackPlan = renderer.phase7PixelReadbackPlan(
    renderData,
    input.sceneRenderPacket,
    input,
    canvas
  );
  assert.ok(readbackPlan);
  assert.deepEqual(readbackPlan.unmatchedObligationIds, []);
  const phase7 = lab.runPhase7RenderExecution(input, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 1,
    pixelSamples: {
      schema: 'simulatte.phase7PixelSampleSet.v1',
      source: 'visual-morphology-test-readback',
      packetKey: renderData.packetKey,
      samples: readbackPlan.samples.map((sample) => ({
        ...sample,
        rgba: [80, 160, 220, 255],
      })),
    },
  });
  const rows = phase7.artifact.renderExecution.objectRealization.rows.map((row) => (
    row.identityType === 'dog'
      ? {
        ...row,
        realized: false,
        perceptualReady: false,
        morphologyQuality: {
          ...row.morphologyQuality,
          pass: false,
          specificityScore: 0.1,
        },
      }
      : row
  ));
  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        objectRealization: {
          ...phase7.artifact.renderExecution.objectRealization,
          rows,
          perceptualReadyCount: 0,
        },
      },
    },
  };
  const proof = sceneProof.settleSceneProof(tampered).artifact.sceneProof;
  const dog = proof.settledObligations.find((row) => row.obligationId === 'entity:dog');

  assert.equal(dog.status, 'lost');
  assert.match(dog.reason, /lacks contour, topology, or surface specificity/);
  assert.equal(proof.verdict, 'fail');
});

test('object realization fails closed when Phase 7 drops compiled accent lanes', () => {
  const spec = lab.createSpecFromPrompt('a dog beside a glass greenhouse', {
    allowPrototypeFallback: true,
  });
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const parts = renderer.scenePacketObjectParts(packet).map((part) => ({
    ...part,
    accentPattern: '',
  }));
  const realization = renderer.objectRealizationForScenePacket(packet, parts);

  assert.equal(realization.perceptualReadyCount, 0);
  assert.ok(realization.rows.every((row) => row.morphologySubmitted === false));
});

test('object shader consumes the extended contour and surface contract', () => {
  const shader = renderer.WEBGPU_OBJECT_SHADER;

  assert.match(shader, /shapeParams: vec4f/);
  assert.match(shader, /surface: vec4f/);
  assert.match(shader, /accent: vec4f/);
  assert.match(shader, /accentMotion: vec4f/);
  assert.match(shader, /fn objectSuperellipse/);
  assert.match(shader, /fn objectLeaf/);
  assert.match(shader, /fn objectGear/);
  assert.match(shader, /fn objectTaperedCapsule/);
  assert.match(shader, /fn objectSurfacePattern/);
  assert.match(shader, /fn objectAccentColor/);
  assert.match(shader, /u\.viewport\.z \* accent\.w/);
  assert.match(shader, /objectPartMask\(input\.local, input\.shape, input\.shapeParams\)/);
});

test('background shader consumes compiled scene-mix slots as distinct atmosphere layers', () => {
  const shader = renderer.WEBGPU_BACKGROUND_SHADER;

  assert.match(shader, /fn backgroundHash/);
  assert.match(shader, /let caustic =/);
  assert.match(shader, /let nebula =/);
  assert.match(shader, /let networkPulse =/);
  assert.match(shader, /let organicMotes =/);
  assert.match(shader, /let aurora =/);
  assert.match(shader, /let wavefront =/);
  assert.match(shader, /let instrumentScan =/);
});
