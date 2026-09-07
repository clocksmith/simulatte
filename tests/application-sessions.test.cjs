const test = require('node:test');
const assert = require('node:assert/strict');
const proofApi = require('../public/blank/app/prompt/prompt-proof-session.js');
const controlsApi = require('../public/simulatte/app/city-run-controls.js');
const recorderApi = require('../public/simulatte/app/journey-recorder.js');

test('late compiler proof completion and failure cannot publish into a newer program', async () => {
  for (const fails of [false, true]) {
    let resolve, reject;
    const pending = new Promise((a, b) => { resolve = a; reject = b; });
    let spec = { contentHash: 'original' };
    let refreshes = 0;
    const events = [];
    const session = proofApi.create({
      root: { getElementById: () => null, defaultView: { SimulatteWorldProof: { createReplayBaseline() {} } } },
      canvas: {}, trainingRun: {}, runView: { recordSceneProof() {} },
      compilerProof: { required: () => true, receiptFor: () => null, invalidate() {}, verify: () => pending },
      worldImprovementSession: { observeProof() {} }, getSpec: () => spec, getBuildSerial: () => 1,
      getSimulationReceipt: () => null, refreshRender: () => { refreshes += 1; },
      setSpec() {}, publishRuntime: (event) => events.push(event), onImprovement() {},
    });
    session.observe({ final: true, phase7Output: { artifact: { renderExecution: {
      worldProofBinding: { worldSpec: { contentHash: 'original' } },
    } } }, phase8Output: { artifact: { worldProof: {}, sceneProof: {} } } });
    spec = { contentHash: 'newer' }; session.invalidate();
    if (fails) reject(new Error('stale failure')); else resolve({ status: 'pass' });
    await new Promise((done) => setImmediate(done));
    assert.equal(refreshes, 0); assert.deepEqual(events, []);
    assert.equal(session.beginReplay(), false);
  }
});

test('run controls do not step a controller after the application unmounts', async () => {
  let active = true, release;
  const events = new Map();
  const controller = { snapshot: () => ({ state: { status: 'active' } }), step: () => assert.fail('stale step') };
  let current = null;
  const build = new Promise((resolve) => { release = () => { current = controller; resolve(controller); }; });
  const elements = Object.fromEntries(['startButton', 'resumeButton', 'newMissionButton', 'shuffleButton',
    'pauseButton', 'stepButton', 'resetButton', 'replayButton', 'playbackSpeed', 'playbackTimeline'].map((id) => [id, { id }]));
  controlsApi.connect({ elements, on: (node, event, callback) => events.set(`${node.id}:${event}`, callback),
    isActive: () => active, isRunning: () => false, interactionMode: 'prompt', getPlayback: () => null,
    getController: () => current, getScenario: () => ({}), buildController: () => build, stopLoop() {},
    onError: (error) => assert.fail(error.message),
  });
  const attempt = events.get('stepButton:click')();
  active = false; release(); await attempt;
});

test('journey recording is single-flight and rejects superseded settlement before persistence', async () => {
  let current = true, release;
  let settlements = 0, writes = 0, publications = 0;
  const settlement = new Promise((resolve) => { release = resolve; });
  const runtime = { settle() { settlements += 1; return settlement; }, runtimeReceipt: () => ({}) };
  const context = { revision: 1, runtime };
  const recorder = recorderApi.create({ getContext: () => context, isCurrent: () => current,
    ledger: { append: async () => { writes += 1; } }, onReceipt: () => { publications += 1; }, refreshLedger() {},
  });
  const controller = { journeyReceipt: async () => ({ mission: { id: 'm' }, integrity: { terminalHash: 'hash' }, finalState: { status: 'completed' } }) };
  const first = recorder.record(controller), second = recorder.record(controller);
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlements, 1);
  current = false; release([]);
  assert.equal(await first, null);
  assert.equal(writes, 0); assert.equal(publications, 0);
});

test('failed ledger writes can retry without discarding the completed receipt', async () => {
  let writes = 0;
  const source = { mission: { id: 'm' }, integrity: { terminalHash: 'hash' }, finalState: { status: 'completed' } };
  const context = { revision: 1, runtime: { settle: async () => [], runtimeReceipt: () => ({}) } };
  const recorder = recorderApi.create({ getContext: () => context, isCurrent: () => true,
    ledger: { append: async () => { if (++writes === 1) throw new Error('storage failed'); } }, onReceipt() {}, refreshLedger() {},
  });
  const controller = { journeyReceipt: async () => source };
  await assert.rejects(recorder.record(controller), /storage failed/);
  assert.equal((await recorder.record(controller)).mission.id, 'm');
  assert.equal(writes, 2); assert.equal(source.pluginSettlement, undefined);
});
test('plugin session initializes the camera before view arbitration and cancels deferred drawing on disposal', async () => {
  const { create } = require('../public/simulatte/app/city-plugin-session.js');
  const events = [];
  const timeline = { receipt: () => ({ id: 'timeline', eventCount: 0 }) };
  const clock = { snapshot: () => ({ timelineId: 'timeline', eventCount: 0, currentMs: 0 }),
    receipt: () => ({}), pause() {} };
  const renderer = { cameraState: () => ({}),
    session: { setScene: (scene) => {
      assert.deepEqual(scene.presentations, []);
      assert.deepEqual(scene.selectedIds, ['route']);
      events.push('draw');
    } }, receipt: () => ({ pluginCompositor: {} }) };
  let frame = Promise.resolve();
  const session = create({
    hostRoot: {}, extensions: { activePluginIds: [], views: () => [],
      platformV4: () => ({ contributions: [], timeline, provenanceReceipts: [] }) },
    pluginUi: { render() {} }, elements: { decisionsButton: {}, applicationProfileLabel: {} },
    profile: {}, interaction: {},
    experienceCameraApi: { applyInitialCamera: () => { events.push('initial-camera'); return true; } },
    simulationClockApi: { createClock: () => clock },
    pluginViewRuntimeApi: { createCoordinator: () => ({ sync: () => { events.push('view'); return {}; } }) },
    recordRenderWork() {}, renderWorkReceipt: () => ({}), renderExperienceSummary() {}, summarize: () => ({}),
    yieldToFrame: () => frame, getScenario: () => ({}), getCameraMode: () => '', getRenderer: () => renderer,
    applyRouteParameters: () => false, onViewRuntime() {},
  });
  await session.render({});
  assert.deepEqual(events, ['draw', 'initial-camera', 'view']);
  let release;
  frame = new Promise(resolve => { release = resolve; });
  const pending = session.render({});
  session.dispose(); release(); await pending;
  assert.deepEqual(events, ['draw', 'initial-camera', 'view']);
});


test('invalidating a construction retry aborts execution and suppresses late publication and failure', async () => {
  for (const fails of [false, true]) {
    let resolve, reject, signal;
    const pending = new Promise((a, b) => { resolve = a; reject = b; });
    let published = 0;
    const events = [];
    const trainingRun = { runId: 'fixture', prompt: 'a cat', serial: 1 };
    const packet = { entities: [{ id: 'cat', identity: { type: 'cat' }, geometry: { program: {
      grammarId: 'cat-first', constructionSelectionReceipt: { attempt: 0, seed: 0,
        candidates: [{ grammarId: 'cat-first' }, { grammarId: 'cat-next' }] },
    } } }] };
    const session = proofApi.create({
      root: { getElementById: () => null, defaultView: {} }, canvas: {}, trainingRun,
      compilerProof: { invalidate() {} }, worldImprovementSession: { observeProof() {} },
      getSpec: () => ({ contentHash: 'original' }), getBuildSerial: () => 1,
      retryConstruction(_spec, _decision, _report, invocationSignal) { signal = invocationSignal; return pending; },
      setSpec() { published++; }, publishRuntime: event => events.push(event),
    });
    const report = { final: true, sceneRenderPacket: packet, packetKey: 'fixture-packet',
      phase7Output: { artifact: { renderExecution: { worldProofBinding: { worldSpec: { contentHash: 'original' } } } } },
      phase8Output: { artifact: { compositionLedger: { obligations: [{ id: 'entity:cat', required: true, targetIdentity: 'cat' }] },
        sceneProof: { verdict: 'fail', settledObligations: [{ obligationId: 'entity:cat', status: 'lost' }] } } },
    };
    session.observe(report);
    await new Promise(done => setImmediate(done));
    assert.equal(signal.aborted, false);
    const count = events.length;
    session.observe({ ...report, packetKey: 'concurrent-report' });
    assert.equal(trainingRun.constructionSearch.attempts.length, 1, 'pending retry cannot consume another attempt');
    session.invalidate();
    assert.equal(signal.aborted, true);
    if (fails) reject(new Error('late retry failure')); else resolve({ program: {}, phaseRun: {} });
    await new Promise(done => setImmediate(done));
    assert.equal(published, 0);
    assert.equal(events.length, count);
  }
});
