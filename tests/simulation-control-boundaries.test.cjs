const test = require('node:test');
const assert = require('node:assert/strict');
const { scenarioControlSelection } = require('../public/simulatte/app/world-tiers-boot.js');
const { createController } = require('../public/simulatte/app/tier-run-controller.js');

const scenarios = [{ id: 'first', scenarioId: 'a', seed: 'one' }, { id: 'second', scenarioId: 'b', seed: 'two' }];
const controls = [{ id: 'scenarioChoice', kind: 'select', options: [{ value: 'a' }, { value: 'b' }] }];

test('duplicate scenario control resolves the declared profile seed', () => {
  assert.equal(scenarioControlSelection(scenarios, controls, 'scenarioChoice', 'b'), scenarios[1]);
});
test('partial or unrelated option catalogues are not scenario navigation', () => {
  assert.equal(scenarioControlSelection(scenarios, [{ ...controls[0], options: [{ value: 'b' }] }], 'scenarioChoice', 'b'), null);
  assert.equal(scenarioControlSelection(scenarios, [{ ...controls[0], options: [{ value: 'b' }, { value: 'other' }] }], 'scenarioChoice', 'b'), null);
  assert.equal(scenarioControlSelection(scenarios, controls, 'otherControl', 'b'), null);
});
test('duplicate option values cannot impersonate a scenario catalogue', () => {
  assert.equal(scenarioControlSelection(scenarios, [{ ...controls[0], options: [{ value: 'b' }, { value: 'b' }] }], 'scenarioChoice', 'b'), null);
});

function fixture(refuse = false) {
  const calls = [];
  const runtime = {
    views: () => [{ pluginId: 'fixture', view: { actions: [{ id: 'fixture.configuration.apply' }] } }],
    dispatchAction: async (owner, action, context) => {
      calls.push({ owner, action, context });
      return action.endsWith('.configuration.apply')
        ? { status: refuse ? 'refused' : 'applied' }
        : { status: 'running', currentStep: 0, totalSteps: 2 };
    },
  };
  const controller = createController({ getRuntime: () => runtime, ownerPluginId: 'fixture', scenario: scenarios[0],
    profileId: 'fixture-profile', resetRuntime: async () => {}, render: () => {}, buildReceipt: () => ({}),
    setTimer: () => 1, clearTimer: () => {},
  });
  return { controller, calls };
}
test('configuration is applied before preparing playback, including replay', async () => {
  const { controller, calls } = fixture();
  try {
    await controller.applyControls({ policy: 'new' });
    assert.deepEqual(calls.map(row => row.action), ['fixture.configuration.apply', 'scenario.run']);
    assert.deepEqual(calls[0].context.values, { policy: 'new' });
    await controller.start();
    assert.equal(calls.length, 2);
    await controller.replay();
    assert.deepEqual(calls.slice(2).map(row => row.action), ['fixture.configuration.apply', 'scenario.run']);
  } finally { controller.dispose(); }
});
test('refused configuration never starts playback', async () => {
  const { controller, calls } = fixture(true);
  try {
    await assert.rejects(controller.applyControls({ policy: 'invalid' }), /tier_configuration_refused/);
    assert.equal(calls.length, 1);
    assert.equal(controller.snapshot().state, 'failed');
  } finally { controller.dispose(); }
});
