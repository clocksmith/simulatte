const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const network = require('../public/shared/plugins/cable-trader/network-simulation.js');
const config = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins/cable-trader/default-config.json'), 'utf8'));

function completeRoutes() {
  return config.hubs.flatMap((source, sourceIndex) => config.hubs
    .filter((destination) => destination.id !== source.id)
    .map((destination, destinationIndex) => ({
      sourceHubId: source.id,
      destinationHubId: destination.id,
      costUnits: 10 + sourceIndex + destinationIndex,
      segmentIds: [`segment-${source.id}-${destination.id}`],
    })));
}

test('exact transport solver reroutes an early choice to reach the global minimum', () => {
  const result = network.minimumCostTransport([1, 1], [1, 1], [[1, 2], [2, 100]]);
  assert.equal(result.delivered, 2);
  assert.equal(result.cost, 4);
  assert.equal(result.optimalityProven, true);
  assert.deepEqual(result.flows.map((row) => [row.source, row.destination, row.quantity]), [[0, 1, 1], [1, 0, 1]]);
});

test('predefined cable month serves thousands of needs with exact optimal allocations', () => {
  const first = network.simulateNetwork(config, completeRoutes());
  const second = network.simulateNetwork(config, completeRoutes());
  assert.deepEqual(first, second);
  assert.equal(first.summary.needs, 4096);
  assert.equal(first.summary.fulfilledNeeds, 4096);
  assert.equal(first.summary.fulfillmentPercent, 100);
  assert.equal(first.summary.randomEvents, 9152);
  assert.equal(first.summary.participants, 2048);
  assert.equal(first.summary.optimalAllocations, 300);
  assert.equal(first.summary.optimalityPercent, 100);
  assert.equal(first.summary.optimalityProven, true);
  assert.equal(first.daily.length, 30);
  assert.ok(first.daily.every((day) => day.fulfilled === day.needs && day.optimalityProven));
  assert.ok(first.flows.some((flow) => flow.sourceHubId !== flow.destinationHubId && flow.quantity > 0));
  assert.ok(Object.values(first.endingInventory).every((quantity) => Number.isInteger(quantity) && quantity >= 0));
  assert.equal(first.summary.startingInventory + first.summary.returns - first.summary.needs, first.summary.endingInventory);
});

test('Cable Trader profile queries the predefined network instead of creating one-off cable requests', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'), 'utf8'));
  assert.equal(profile.plugins[0].configId, 'cable-trader-network-v2');
  assert.equal(profile.interaction.mode, 'playback');
  assert.equal(profile.interaction.shuffleLabel, 'Shuffle seed');
  assert.ok(profile.seeds.length >= 4);
  assert.ok(profile.seeds.every((row) => !/\bI need\b|\bGet me\b|\bBorrow\b/i.test(row.missionText)));
  const results = profile.seeds.slice(0, 2).map((row) => network.simulateNetwork({ ...config, simulation: { ...config.simulation, seed: row.seed } }, completeRoutes()));
  assert.notEqual(results[0].id, results[1].id);
  assert.ok(results.every((row) => row.summary.fulfillmentPercent === 100 && row.summary.optimalityPercent === 100));
});
