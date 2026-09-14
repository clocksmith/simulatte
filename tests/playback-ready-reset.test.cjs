const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../public/simulatte/app/plugin-playback.js');

function fixture({ refuse = false } = {}) {
  let prepared = false;
  let starts = 0;
  let renders = 0;
  let playing = false;
  const scenario = { id: 'lazy-simulation', seed: 'declared-seed' };
  const runtime = {
    setScenario: async () => { prepared = false; },
    settle: async () => [],
    dispatchAction: async (_owner, action, context) => {
      assert.equal(action, 'scenario.run');
      assert.equal(context.values.phase, 'start');
      starts += 1;
      prepared = !refuse;
      return refuse ? { status: 'refused' } : { status: 'running', currentStep: 0, totalSteps: 4 };
    },
  };
  const clock = {
    subscribe: () => () => {}, pause: () => { playing = false; }, play: () => { playing = true; },
    seek: value => assert.equal(value, 0), snapshot: () => ({ currentMs: 0, playing }),
  };
  const controller = createController({ runtime, ownerPluginId: 'fixture', scenario, clock,
    render: () => { assert.equal(prepared, true, 'render must receive a prepared simulation'); renders += 1; },
  });
  return { controller, scenario, state: () => ({ starts, renders, playing }) };
}

test('reset prepares lazy controls while leaving playback paused at step zero', async () => {
  const { controller, state } = fixture();
  try {
    await controller.reset();
    assert.deepEqual(state(), { starts: 1, renders: 1, playing: false });
    assert.equal(controller.snapshot().phase, 'ready');
    assert.equal(controller.snapshot().currentStep, 0);
    assert.equal(controller.snapshot().totalSteps, 4);
    await controller.start();
    assert.deepEqual(state(), { starts: 1, renders: 1, playing: true });
  } finally { controller.dispose(); }
});
test('internal scenario transitions can defer preparing and rendering', async () => {
  const { controller, scenario, state } = fixture();
  try {
    await controller.reset(scenario, { renderReadyState: false });
    assert.deepEqual(state(), { starts: 0, renders: 0, playing: false });
    await controller.start();
    assert.deepEqual(state(), { starts: 1, renders: 1, playing: true });
  } finally { controller.dispose(); }
});
test('failed reset preparation is not rendered as a usable Ready simulation', async () => {
  const { controller, state } = fixture({ refuse: true });
  try {
    await assert.rejects(controller.reset(), /plugin_playback_reset_refused/);
    assert.equal(state().renders, 0);
    assert.equal(state().playing, false);
  } finally { controller.dispose(); }
});
