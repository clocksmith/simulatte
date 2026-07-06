const assert = require('node:assert/strict');
const test = require('node:test');

const engine = require('../public/app/session/simulatte-scenario-engine.js');

test('builds a transit scenario from prompt terms', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate a transit strike during a heatwave');

  assert.equal(scenario.title, 'Transit Strike During Heatwave');
  assert.equal(scenario.domain, 'civic systems');
  assert.equal(scenario.visual, 'transit-heat');
  assert.ok(scenario.actors.some((actor) => actor.name === 'Transit agency'));
  assert.ok(scenario.shocks.some((shock) => shock.name === 'Driver strike'));
  assert.ok(scenario.goals.length >= 3);
});

test('applies editable setup fields into normalized scenario objects', () => {
  const base = engine.buildScenarioFromPrompt('simulate a power outage after a storm');
  const edited = engine.normalizeScenario(
    engine.applyScenarioEdits(base, {
      actorsText: 'Utility\nHospital\nHouseholds',
      resourcesText: 'Battery reserve\nRepair crews',
      rulesText: 'Critical loads first\nRepair restores coverage',
      shocksText: 'Storm damage\nPeak load surge',
      goalsText: 'Protect hospitals\nRestore service',
    })
  );

  assert.deepEqual(edited.actors.map((actor) => actor.name), ['Utility', 'Hospital', 'Households']);
  assert.deepEqual(edited.resources.map((resource) => resource.name), ['Battery reserve', 'Repair crews']);
  assert.equal(edited.rules[0].text, 'Critical loads first');
  assert.equal(edited.shocks[1].step, 2);
  assert.equal(edited.goals[1].text, 'Restore service');
});

test('simulation steps are deterministic for the same scenario', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate a housing shortage after a rent spike');
  const first = engine.runSteps(engine.createRunState(scenario), 5);
  const second = engine.runSteps(engine.createRunState(scenario), 5);

  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.resources, second.resources);
  assert.deepEqual(first.actors, second.actors);
  assert.equal(first.replay[0].step, 5);
});

test('run state produces map signals and replay summaries', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate agents trading during a resource shortage');
  const run = engine.runSteps(engine.createRunState(scenario), 3);
  const summary = engine.summarizeRun(run);

  assert.equal(run.tick, 3);
  assert.ok(run.map.hotspots.length >= 4);
  assert.ok(run.map.markers.length > 0);
  assert.ok(run.map.sceneObjects.some((object) => object.kind === 'actor'));
  assert.ok(run.map.sceneObjects.some((object) => object.kind === 'resource'));
  assert.ok(run.map.sceneObjects.some((object) => object.kind === 'shock'));
  assert.equal(run.map.effects.kind, 'agents');
  assert.ok(Array.isArray(run.replay[0].affects));
  assert.ok(run.replay[0].affects.length > 0);
  assert.ok(run.worldSpec.nodes.length >= 10);
  assert.ok(run.worldSpec.flows.length >= 3);
  assert.ok(run.stocks.some((stock) => stock.id === 'stock-system-load'));
  assert.ok(Array.isArray(run.replay[0].cause.firedRules));
  assert.match(summary.text, /Agent Market Test/);
  assert.ok(['stable', 'strained', 'critical'].includes(summary.outcome));
});

test('scenario edit text round trips for the UI form', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate a supply chain delay at a port');
  const editable = engine.scenarioToEditable(scenario);

  assert.equal(editable.title, 'Supply Chain Delay');
  assert.match(editable.actorsText, /Supplier/);
  assert.match(editable.resourcesText, /Inventory/);
  assert.match(editable.rulesText, /Inventory absorbs/);
});

test('compiles a completion room with world spec and replay artifact', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate a grid outage recovery after a coastal storm');
  const run = engine.runSteps(engine.createRunState(scenario), 12);
  const room = engine.createCompletionRoom(run, 'complete', '2026-06-15T00:00:00.000Z');

  assert.equal(room.schema, 'simulatte.completionRoom.v1');
  assert.equal(room.room.status, 'complete');
  assert.equal(room.worldSpec.schema, 'simulatte.worldSpec.v1');
  assert.equal(room.worldSpec.renderer.particles, 'webgpu-if-available');
  assert.ok(room.replay.length > 1);
  assert.ok(room.summary.worldSpec.nodes >= 10);
});

test('interpolates run states for continuous rendering between steps', () => {
  const scenario = engine.buildScenarioFromPrompt('simulate a transit strike during a heatwave');
  const from = engine.createRunState(scenario);
  const to = engine.stepRun(from);
  const mid = engine.interpolateRunStates(from, to, 0.5);

  assert.equal(mid.transition.fromTick, 0);
  assert.equal(mid.transition.toTick, 1);
  assert.equal(mid.tick, 0.5);
  assert.ok(mid.metrics.load > Math.min(from.metrics.load, to.metrics.load) - 0.01);
  assert.ok(mid.metrics.load < Math.max(from.metrics.load, to.metrics.load) + 0.01);
  assert.ok(mid.map.hotspots.length >= 4);
  assert.ok(mid.map.sceneObjects.some((object) => object.kind === 'actor'));
});
