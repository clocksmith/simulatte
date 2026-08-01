const assert = require('node:assert/strict');
const test = require('node:test');

const values = require('../public/simulatte/app/run-control-values.js');

test('run control values clone nested controls and compare equivalent fresh values', () => {
  const source = {
    policy: {
      lanes: ['priority', 'standard'],
      thresholds: { reserve: 4 },
    },
  };
  const normalized = values.normalizeValues(source);

  source.policy.lanes.push('emergency');
  source.policy.thresholds.reserve = 12;

  assert.deepEqual(normalized, {
    policy: {
      lanes: ['priority', 'standard'],
      thresholds: { reserve: 4 },
    },
  });
  assert.equal(values.sameValues(normalized, {
    policy: {
      thresholds: { reserve: 4 },
      lanes: ['priority', 'standard'],
    },
  }), true);
});

test('run control values reject circular configuration instead of retaining a mutable reference', () => {
  const source = {};
  source.self = source;
  assert.throws(() => values.normalizeValues(source), /simulatte_run_control_values_circular/);
});
