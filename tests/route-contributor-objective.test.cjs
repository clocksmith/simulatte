const test = require('node:test');
const assert = require('node:assert/strict');
const routePlanner = require('../public/simulatte/world/route-planner.js');

test('route planner skips declared non-rejecting contributors when every owned dimension has zero weight', () => {
  const irrelevant = { id: 'sun', costDimensionIds: ['sunExposureSeconds'], canRejectSegments: false, evaluateSegment() { throw new Error('must not execute'); } };
  assert.deepEqual(routePlanner.contributorsForObjective([irrelevant], { sunExposureSeconds: 0 }), []);
  assert.deepEqual(routePlanner.contributorsForObjective([irrelevant], {}), []);
  assert.deepEqual(routePlanner.contributorsForObjective([irrelevant], { sunExposureSeconds: 1 }), [irrelevant]);
});

test('route planner keeps contributors that can reject or do not declare a complete cost contract', () => {
  const rejecting = { id: 'rejecting', costDimensionIds: ['risk'], canRejectSegments: true };
  const legacy = { id: 'legacy' };
  assert.deepEqual(routePlanner.contributorsForObjective([rejecting, legacy], { risk: 0 }), [rejecting, legacy]);
});
