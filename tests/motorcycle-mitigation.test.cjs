const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const simApi = require(path.join(ROOT, 'public/simulatte/motorcycle-mitigation/simulation.js'));
const pluginApi = require(path.join(ROOT, 'public/shared/plugins/motorcycle-mitigation/index.js'));
const v4Api = require(path.join(ROOT, 'public/shared/plugins/motorcycle-mitigation/v4-contribution.js'));

test('simulation initializes with deterministic scenarios and boids swarm', () => {
  const sim = simApi.createSimulation({ scenarioId: 'avenue-straight-pipe-run' });
  const state = sim.getState();

  assert.equal(state.scenario.id, 'avenue-straight-pipe-run');
  assert.equal(state.bikes.length, 16);
  assert.equal(state.soundProbes.length, 64);
  assert.equal(state.currentTime, 0);
  assert.equal(state.tickCount, 0);

  // Verify all bikes have engine profiles and intake profiles assigned
  state.bikes.forEach((bike) => {
    assert.ok(bike.bikeIndex >= 1 && bike.bikeIndex <= 16);
    assert.ok(bike.engineType in simApi.ENGINE_PROFILES);
    assert.ok(bike.intakeType in simApi.INTAKE_PROFILES);
    assert.equal(bike.engineState, 'normal');
    assert.ok(bike.spl > 90);
    assert.ok(bike.plate.number.length >= 6);
  });
});

test('physics stepping advances swarm and updates acoustics deterministically', () => {
  const sim = simApi.createSimulation({ scenarioId: 'avenue-straight-pipe-run' });

  const initialX = sim.getState().bikes[0].x;
  sim.step(0.1);
  const state1 = sim.getState();

  assert.equal(state1.tickCount, 1);
  assert.ok(state1.currentTime >= 0.099 && state1.currentTime <= 0.101);
  assert.ok(state1.bikes[0].x > initialX);

  const metrics = sim.getMetrics();
  assert.ok(metrics.peakSidewalkDba > 70);
  assert.ok(metrics.unmitigatedPeakDba >= metrics.peakSidewalkDba);
});

test('countermeasure 1: reverse sound engineering delivers destructive attenuation', () => {
  const sim = simApi.createSimulation({ scenarioId: 'avenue-straight-pipe-run' });

  // Baseline: no active countermeasures
  sim.setControl('reverseSoundEnabled', false);
  sim.setControl('hydroSuppressionEnabled', false);
  sim.setControl('acousticTrackingEnabled', false);

  for (let i = 0; i < 20; i++) sim.step(0.1);
  const baselineMetrics = sim.getMetrics();

  assert.equal(baselineMetrics.activeAttenuationDba, 0);
  const unmitigatedPeak = baselineMetrics.peakSidewalkDba;

  // Turn ON anti-phase phased array at 90% power
  sim.setControl('reverseSoundEnabled', true);
  sim.setControl('reverseSoundPower', 0.9);
  sim.step(0.1);

  const mitigatedMetrics = sim.getMetrics();
  assert.ok(mitigatedMetrics.activeAttenuationDba >= 10);
  assert.ok(mitigatedMetrics.peakSidewalkDba < unmitigatedPeak);
});

test('countermeasure 2: targeted hydro-suppression quenches combustion and stalls open intakes', () => {
  const sim = simApi.createSimulation({ scenarioId: 'avenue-straight-pipe-run' });

  sim.setControl('reverseSoundEnabled', false);
  sim.setControl('hydroSuppressionEnabled', true);
  sim.setControl('hydroMistRate', 120);

  // Advance simulation so bikes traverse through the hydro mist gantry (around x = 420m)
  for (let i = 0; i < 200; i++) {
    sim.step(0.1);
  }

  const state = sim.getState();
  const metrics = sim.getMetrics();

  // At least some bikes with open velocity stacks or pods should have misfired or stalled
  const affectedBikes = state.bikes.filter((b) => b.engineState === 'misfire' || b.engineState === 'stalled');
  assert.ok(affectedBikes.length > 0, 'Expected bikes to ingest water mist and transition engine state');

  const stalledBikes = state.bikes.filter((b) => b.engineState === 'stalled');
  assert.ok(stalledBikes.length > 0, 'Expected open intake bikes to reach quench stall ratio (mw/ma > 0.08)');

  stalledBikes.forEach((sb) => {
    assert.equal(sb.rpm, 0, 'Stalled bike RPM must drop to 0');
    assert.equal(sb.spl, 0, 'Stalled bike combustion SPL must drop to 0');
    assert.ok(sb.intakeSaturationRatio >= simApi.WATER_QUENCH_STALL_RATIO);
  });

  assert.ok(metrics.stalledBikesCount > 0);
  assert.ok(metrics.stalledPercentage > 0);
});

test('countermeasure 3: acoustic fingerprinting, plate deblurring, and SHA-256 receipts', () => {
  const sim = simApi.createSimulation({ scenarioId: 'avenue-straight-pipe-run' });

  sim.setControl('reverseSoundEnabled', false);
  sim.setControl('hydroSuppressionEnabled', false);
  sim.setControl('acousticTrackingEnabled', true);
  sim.setControl('trackingThresholdDba', 85); // sensitive threshold

  // Advance until bikes pass tracking gantry (around x = 490m)
  for (let i = 0; i < 220; i++) {
    sim.step(0.1);
  }

  const state = sim.getState();
  const receipts = state.violationReceipts;

  assert.ok(receipts.length > 0, 'Expected violations to be logged');

  receipts.forEach((r) => {
    assert.equal(r.schema, 'simulatte.motorcycleMitigationViolation.v1');
    assert.ok(r.timestampSec > 0);
    assert.ok(r.bikeId >= 1);
    assert.ok(r.measuredSplDba >= 85);
    assert.ok(r.deblurConfidence > 0);
    if (r.plateDeblurred) {
      assert.ok(r.deblurConfidence >= 0.75);
      assert.notEqual(r.plateNumber, 'UNRESOLVED_PLATE_ANGLE');
    } else {
      assert.equal(r.plateNumber, 'UNRESOLVED_PLATE_ANGLE');
    }
    assert.ok(typeof r.plateNumber === 'string');
    assert.ok(typeof r.hashSeal === 'string' && r.hashSeal.length === 32);
  });
});

test('simulatte application profile and plugin manifest match repository contracts', () => {
  const profilePath = path.join(ROOT, 'public/data/application-profiles/motorcycle-mitigation-v1.json');
  const manifestPath = path.join(ROOT, 'public/shared/plugins/motorcycle-mitigation/plugin.json');
  const configSchemaPath = path.join(ROOT, 'public/shared/plugins/motorcycle-mitigation/config.schema.json');
  const defaultConfigPath = path.join(ROOT, 'public/shared/plugins/motorcycle-mitigation/default-config.json');

  assert.ok(fs.existsSync(profilePath), 'Application profile must exist');
  assert.ok(fs.existsSync(manifestPath), 'Plugin manifest must exist');
  assert.ok(fs.existsSync(configSchemaPath), 'Config schema must exist');
  assert.ok(fs.existsSync(defaultConfigPath), 'Default config must exist');

  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const configSchema = JSON.parse(fs.readFileSync(configSchemaPath, 'utf8'));
  const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));

  assert.equal(profile.schema, 'simulatte.applicationProfile.v3');
  assert.equal(profile.id, 'motorcycle-mitigation-v1');
  assert.equal(manifest.schema, 'simulatte.pluginManifest.v3');
  assert.equal(manifest.id, 'motorcycle-mitigation');

  // Verify plugin instance creation
  const instance = pluginApi.createInstance(defaultConfig);
  assert.equal(typeof instance.step, 'function');
  assert.equal(typeof instance.getState, 'function');
  assert.equal(typeof instance.getV4Contribution, 'function');

  instance.step(0.05);
  const contribution = instance.getV4Contribution();
  assert.equal(contribution.pluginId, 'motorcycle-mitigation');
  assert.ok(contribution.corridorStatus.totalBikes > 0);
});

test('workspace rules: zero occurrences of the forbidden word', () => {
  const targetFiles = [
    'public/simulatte/motorcycle-mitigation/simulation.js',
    'public/simulatte/motorcycle-mitigation/audio-engine.js',
    'public/simulatte/motorcycle-mitigation/styles.css',
    'public/simulatte/motorcycle-mitigation/index.html',
    'public/data/application-profiles/motorcycle-mitigation-v1.json',
    'public/shared/plugins/motorcycle-mitigation/plugin.json',
    'public/shared/plugins/motorcycle-mitigation/config.schema.json',
    'public/shared/plugins/motorcycle-mitigation/default-config.json',
    'public/shared/plugins/motorcycle-mitigation/index.js',
    'public/shared/plugins/motorcycle-mitigation/v4-contribution.js',
    'tests/motorcycle-mitigation.test.cjs',
  ];

  // Pattern check for forbidden term
  const forbidden = 'dur' + 'able';

  for (const relPath of targetFiles) {
    const fullPath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
    const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
    const hasForbidden = content.includes(forbidden);
    assert.equal(hasForbidden, false, `File ${relPath} contains forbidden word`);
  }
});
