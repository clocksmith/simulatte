const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const profileProgram = require('../public/simulatte/app/profile-program.js');
const profileWorldSpec = require('../public/shared/contracts/profile-world-spec.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');
const runtimeManifest = require('../public/simulatte/app/world-runtime-script-manifest.js');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fixture() {
  const profile = readJson('public/data/application-profiles/cable-trader-pickup-v1.json');
  const pluginManifests = profile.plugins.map((selection) => (
    readJson(`public/shared/plugins/${selection.id}/plugin.json`)
  ));
  const spec = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[0],
    pluginManifests,
  });
  return { profile, pluginManifests, spec };
}

test('World profile editor turns one scenario selector edit into a complete governed recompile', () => {
  const { profile, pluginManifests, spec } = fixture();
  const candidate = JSON.parse(worldSpec.serializeWorldSpec(spec));
  candidate.params.scenarioId = profile.seeds[1].id;

  assert.throws(
    () => worldSpec.parseWorldSpec(JSON.stringify(candidate)),
    (error) => error.code === 'SIMULATTE_WORLD_SPEC_INVALID' && error.path === '$.contentHash'
  );
  const parsedCandidate = worldSpec.parseWorldSpecEditCandidate(JSON.stringify(candidate));

  const target = profileProgram.scenarioEditTarget(spec, parsedCandidate, profile);
  const compiled = profileWorldSpec.compileProfileScenarioSelection({
    profile,
    scenarioId: target.id,
    pluginManifests,
  });

  assert.equal(target.id, profile.seeds[1].id);
  assert.match(compiled.source.prompt, new RegExp(`Profile ${profile.id}`));
  assert.match(compiled.source.prompt, new RegExp(`Scenario ${target.id}`));
  assert.ok(compiled.source.prompt.endsWith(`Mission ${target.missionText}`));
  assert.equal(compiled.contract.scenarioContentHash, profileWorldSpec.valueHash(target));
  assert.equal(compiled.universeGraph.nodes.find((row) => row.kind === 'scenario').label, target.id);
  assert.equal(compiled.phaseArtifacts.phase2.artifact.languageGraph.sourceText, compiled.source.prompt);
  assert.equal(compiled.phaseArtifacts.phase4.artifact.intentSettlement.status, 'pass');
  assert.equal(compiled.phaseArtifacts.phase4.artifact.semanticProvenance.status, 'pass');
  assert.equal(compiled.phaseArtifacts.phase5.artifact.scenarioId, target.id);
  assert.equal(compiled.authorship.revision, 0);
});

test('World profile imports verify declared identity before entering the governed editor', () => {
  const source = fs.readFileSync(path.join(ROOT, 'public/simulatte/app/profile-program.js'), 'utf8');

  assert.match(source, /const imported = worldSpec\.parseWorldSpec\(await file\.text\(\)\)/);
  assert.match(source, /worldSpec\.parseWorldSpecEditCandidate\(elements\.editor\.value\)/);
});

test('World profile editor rejects fields whose runtime semantics are not implemented', () => {
  const { profile, spec } = fixture();
  const candidate = JSON.parse(worldSpec.serializeWorldSpec(spec));
  candidate.params.scenarioId = profile.seeds[1].id;
  candidate.params.routeObjective = { invented: true };

  assert.throws(
    () => profileProgram.scenarioEditTarget(spec, candidate, profile),
    (error) => error.code === 'profile_program_edit_unsupported' &&
      /params\/routeObjective/.test(error.message)
  );
});

test('World profile replay identity excludes host-only runtime envelopes', () => {
  const base = {
    schema: 'simulatte.tierRunReceipt.v1',
    tier: 'world',
    profileId: 'fixture-profile',
    scenario: { id: 'fixture-scenario', seed: 'fixture-seed' },
    parameterValues: { rate: 2 },
    actionResult: { status: 'settled', value: 4 },
    settlement: { status: 'settled' },
    pluginRuntime: { pluginReceipts: [{ volatile: 'first' }] },
  };
  const next = structuredClone(base);
  next.pluginRuntime.pluginReceipts[0].volatile = 'second';

  assert.deepEqual(profileProgram.replayIdentity(base), profileProgram.replayIdentity(next));
  assert.equal(profileProgram.isSettledRunReceipt(base), true);
  assert.equal(profileProgram.isSettledRunReceipt({ ...base, actionResult: { status: 'running' } }), false);
});

test('World profile proof hashes in-process render bytes without a Base64 round trip', async () => {
  let requestedEncoding = null;
  const evidence = await profileProgram.captureRenderEvidence({
    async __simulatteCaptureRenderPixels(options) {
      requestedEncoding = options.encoding;
      return {
        width: 2,
        height: 1,
        rgbaBytes: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      };
    },
  });

  assert.equal(requestedEncoding, 'bytes');
  assert.equal(evidence.width, 2);
  assert.equal(evidence.height, 1);
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
});

test('World profile replay invalidation removes stale proof and comparison receipts', () => {
  const target = {
    __simulatteTierRunReceipt: { schema: 'simulatte.tierRunReceipt.v1' },
    __simulatteComparisonExecutionReceipts: Object.freeze([{ state: 'settled' }]),
  };

  profileProgram.invalidateRunReceipt(target, '__simulatteTierRunReceipt');

  assert.equal(target.__simulatteTierRunReceipt, null);
  assert.deepEqual(target.__simulatteComparisonExecutionReceipts, []);
  assert.equal(Object.isFrozen(target.__simulatteComparisonExecutionReceipts), true);
});

test('World profile program binds a verified core autonomy journey and compares its deterministic result', () => {
  const base = {
    schema: 'simulatte.autonomyJourneyReceipt.v2',
    mission: { id: 'mission:one', sourceText: 'Deliver the parcel.' },
    identities: { worldId: 'city:test', policyId: 'policy:test' },
    terminalState: 'completed',
    finalState: { status: 'completed', tick: 12 },
    settlement: { schema: 'simulatte.autonomyJourneySettlement.v1', exactTargetSettlement: true },
    verification: { pass: true, integrityPass: true },
    integrity: { terminalHash: 'terminal:one', entryCount: 12 },
    pluginSettlement: [{ obligationResults: [{ obligationId: 'plugin:one', status: 'settled' }] }],
    pluginRuntime: { events: [{ at: 'host-only' }] },
  };
  const hostOnlyChange = structuredClone(base);
  hostOnlyChange.pluginRuntime.events[0].at = 'different-host-envelope';
  const divergent = structuredClone(base);
  divergent.finalState.tick = 13;
  divergent.integrity.terminalHash = 'terminal:two';

  assert.equal(profileProgram.isSettledRunReceipt(base), true);
  assert.deepEqual(profileProgram.replayIdentity(base), profileProgram.replayIdentity(hostOnlyChange));
  assert.notDeepEqual(profileProgram.replayIdentity(base), profileProgram.replayIdentity(divergent));
  assert.equal(profileProgram.isSettledRunReceipt({ ...base, verification: { pass: false, integrityPass: true } }), false);
  assert.equal(profileProgram.isSettledRunReceipt({
    ...base,
    pluginSettlement: [{ obligationResults: [{ obligationId: 'plugin:one', status: 'failed' }] }],
  }), false);
});

test('World profile editor follows an externally selected scenario while the editor is clean', () => {
  const { profile, pluginManifests, spec } = fixture();
  const next = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[1],
    pluginManifests,
  });
  let activeSpec = spec;
  let observerCallback = null;
  const previousMutationObserver = global.MutationObserver;
  global.MutationObserver = class MutationObserverStub {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  const elements = new Map();
  for (const id of [
    'profile-program-section', 'profile-world-spec-editor', 'profile-world-spec-status',
    'apply-profile-world-spec', 'reset-profile-world-spec', 'export-profile-world-spec',
    'import-profile-world-spec', 'profile-world-spec-import-file', 'replay-profile-world-spec',
    'profile-world-proof-status', 'profile-world-proof',
  ]) {
    elements.set(id, {
      addEventListener() {},
      removeEventListener() {},
      click() {},
      dataset: {},
      disabled: false,
      files: [],
      textContent: '',
      value: '',
    });
  }
  const documentRoot = {
    body: { dataset: { journeyPhase: 'ready' } },
    getElementById: (id) => elements.get(id) || null,
  };
  const manifests = new Map(profile.plugins.map((selection, index) => [
    selection.id,
    { manifest: pluginManifests[index] },
  ]));
  try {
    const program = profileProgram.connect({
      documentRoot,
      profile,
      registry: { entry: (id) => manifests.get(id) || null },
      getRuntime: () => ({ worldSpec: () => activeSpec }),
      getScenario: () => profile.seeds.find((row) => row.id === activeSpec.params.scenarioId),
      getRunReceipt: () => null,
      navigateScenario: async () => {},
      replay: async () => {},
    });
    assert.equal(JSON.parse(elements.get('profile-world-spec-editor').value).contentHash, spec.contentHash);
    activeSpec = next;
    observerCallback();
    assert.equal(JSON.parse(elements.get('profile-world-spec-editor').value).contentHash, next.contentHash);
    assert.equal(JSON.parse(elements.get('profile-world-spec-editor').value).params.scenarioId, profile.seeds[1].id);
    program.dispose();
  } finally {
    global.MutationObserver = previousMutationObserver;
  }
});

test('World page loads the profile program after shared contracts and exposes every control', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  for (const id of [
    'profile-program-section',
    'profile-world-spec-editor',
    'profile-world-spec-status',
    'apply-profile-world-spec',
    'reset-profile-world-spec',
    'replay-profile-world-spec',
    'export-profile-world-spec',
    'import-profile-world-spec',
    'profile-world-spec-import-file',
    'profile-world-proof-status',
    'profile-world-proof',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.ok(runtimeManifest.browser.indexOf('shared/contracts/profile-world-proof.js') <
    runtimeManifest.browser.indexOf('simulatte/app/profile-program.js'));
  assert.ok(runtimeManifest.browser.indexOf('simulatte/app/profile-program.js') <
    runtimeManifest.browser.indexOf('simulatte/app/world-tiers-boot.js'));
  assert.match(html, /src="\.\/simulatte\/app\/profile-program\.js\?/);
});

test('World browser audit verifies governed intent at runtime proof rather than in the export form', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools/simulatte/run-browser-smoke.mjs'), 'utf8');
  assert.match(source, /proof\.proofClasses\.intent\.status === 'pass'/);
  assert.match(source, /proof\.proofClasses\.semantic\.status === 'pass'/);
  assert.doesNotMatch(source, /active\.phaseArtifacts/);
  assert.match(source, /profileChecks=/);
});
