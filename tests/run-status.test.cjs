const test = require('node:test');
const assert = require('node:assert/strict');
const progress = require('../public/blank/app/runtime/runtime-progress-state.js');
const view = require('../public/blank/app/runtime/run-view-model.js');

test('interactive final failure replaces readiness and clears timing forecasts', () => {
  const ready = progress.reduceRuntimeProgress(progress.initialState(), {
    runId: 'balls', state: 'ready', stage: 'ready', timestamp: 100,
  });
  const failed = progress.reduceRuntimeProgress(ready, {
    runId: 'balls', state: 'failed', stage: 'construction-proof', blocking: false,
    message: 'Scene obligations not proven', percent: 100, timestamp: 200,
  });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.blocking, false);
  assert.equal(failed.taskRemainingMs, 0);
  assert.equal(failed.runRemainingMs, 0);
  assert.equal(progress.runtimeTitleText(failed), 'Scene obligations not proven');
  assert.doesNotMatch(failed.subline, /estimated remaining/);
  assert.equal(progress.shouldIgnoreCompletedRunActiveEvent(failed, {
    runId: 'balls', state: 'ready', stage: 'model-selection-ready',
  }), true);
  assert.equal(progress.shouldIgnoreCompletedRunActiveEvent(failed, {
    runId: 'new-run', state: 'active', stage: 'start',
  }), false);
});

test('nonblocking work can progress without becoming a passive receipt', () => {
  const state = progress.reduceRuntimeProgress(progress.initialState(), {
    state: 'active', blocking: false, stage: 'construction-search',
    message: 'Checking next candidate', timestamp: 100,
  });
  assert.equal(state.state, 'active');
  assert.equal(state.blocking, false);
  assert.equal(state.passive, false);
});

test('settled proof cannot be overwritten by a later readiness event', () => {
  const settled = view.recordSceneProof(view.createViewModel('balls'), {
    phase8Output: { schema: 'invalid', artifact: {} },
  });
  assert.equal(settled.status, 'failed');
  assert.equal(view.project({ runId: 'balls', state: 'ready' }, {
    stage: 'construction-proof',
  }, settled), settled);
  const next = view.recordSpec(settled, {});
  assert.equal(next.phases[7].status, 'pending');
  assert.notEqual(view.project({ runId: 'next', state: 'active' }, { stage: 'start' }, settled), settled);
});
