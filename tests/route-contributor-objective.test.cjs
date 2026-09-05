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

test('alternative routes scan speed bounds once per call without changing route receipts', () => {
  let scans = 0;
  const segments = [
    ['ab', 'a', 'b', 1], ['bd', 'b', 'd', 1],
    ['ac', 'a', 'c', 2], ['cd', 'c', 'd', 2],
    ['ad', 'a', 'd', 5],
  ].map(([id, fromNodeId, toNodeId, lengthM]) => ({ id, fromNodeId, toNodeId, lengthM,
    speedLimitMps: 1, allowedModes: ['pedestrian'], laneType: 'protected', riskScore: 0 }));
  const worldModel = {
    world: { get segments() { scans++; return segments; } },
    blockedSegmentIds: () => [],
    outgoing: id => segments.filter(row => row.fromNodeId === id),
    node: () => ({ position: { x: 0, y: 0 } }),
    segment: id => segments.find(row => row.id === id),
  };
  const args = { worldModel, originNodeId: 'a', destinationNodeId: 'd', mode: 'pedestrian', tick: 0,
    mission: { constraints: { maximumSpeedMps: 1 } },
    policy: { route: { blockedSegmentsAreIneligible: true, travelWeight: 1, riskWeight: 0, unprotectedPreferencePenalty: 0 } } };
  const alternatives = routePlanner.planRouteAlternatives(args);
  assert.equal(scans, 1);
  assert.ok(alternatives.length > 1);
  for (const { alternativeKind, deviatedFromSegmentId, alternativeRank, forecast, ...route } of alternatives) {
    const independentlyPlanned = routePlanner.planRoute({ ...args,
      excludedSegmentIds: deviatedFromSegmentId ? [deviatedFromSegmentId] : [] });
    assert.deepEqual(route, independentlyPlanned);
  }
  segments.find(row => row.id === 'ad').speedLimitMps = 10;
  const before = scans;
  const revised = routePlanner.planRouteAlternatives(args);
  assert.equal(scans - before, 1);
  assert.deepEqual(revised[0].segmentIds, ['ad']);
});
