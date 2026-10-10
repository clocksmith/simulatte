import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const files = ['public/blank/pipeline/phase-05-simulation/simulatte-activity-liquid.js',
  'public/blank/pipeline/phase-05-simulation/simulatte-activity-dynamics.js',
  'public/blank/pipeline/phase-08-scene-proof/simulatte-activity-dynamics-proof.js'];
const sourceHashes = () => files.map(file => ({ file,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }));
const sources = sourceHashes();
const lab = require('../public/blank/app/simulation/simulation-lab.js');
const physics = globalThis.SimulattePhaseModuleRegistry.family('physicsModel');
const prompt = 'a person sits on a chair, holds a phone in the left hand, and drinks from a cup with the right hand';
const base = lab.createSpecFromPrompt(prompt, { deterministicRuntime: true }).activityProgram;
function execute(liquidCells, maxStepSeconds) {
  let program = structuredClone(base);
  program.dynamics.liquidCells = liquidCells; program.dynamics.maxStepSeconds = maxStepSeconds;
  program.contentHash = physics.activityProgramHash(program);
  program = physics.phaseContracts.immutableArtifact(program);
  let state = physics.withActivityState({}, program);
  for (let i = 0; i < 241; i++) state = physics.stepActivityState(state, program, 1 / 60);
  const proof = lab.proveActivitySequence(program, state.activity);
  assert.equal(proof.pass, true, JSON.stringify(proof));
  console.log(JSON.stringify({cells:liquidCells,dt:maxStepSeconds,sipKg:proof.metrics.consumedMassKg}));
  return { programHash: program.contentHash, liquidCells, maxStepSeconds, proof,
    maxGripForceNewtons: Math.max(...state.activity.history.map(f => f.dynamics.maxGripForceNewtons)),
    maxGripTorqueNewtonMeters: Math.max(...state.activity.history.map(f => f.dynamics.maxGripTorqueNewtonMeters)),
    maxSupportForceNewtons: Math.max(...state.activity.history.map(f => f.dynamics.maxSupportForceNewtons)) };
}
const temporal = [1 / 120, 1 / 240, 1 / 480].map(dt => execute(128, dt));
const spatial = [320, 640, 1280, 2560].map(cells => execute(cells, 1 / 240));
const differences = rows => rows.slice(1).map((row, i) => Math.abs(row.proof.metrics.consumedMassKg - rows[i].proof.metrics.consumedMassKg));
const temporalDifferencesKg = differences(temporal), spatialDifferencesKg = differences(spatial);
console.log(JSON.stringify({temporal:temporal.map(r=>({dt:r.maxStepSeconds,sipKg:r.proof.metrics.consumedMassKg})),temporalDifferencesKg,spatial:spatial.map(r=>({cells:r.liquidCells,sipKg:r.proof.metrics.consumedMassKg})),spatialDifferencesKg}));
assert.ok(temporalDifferencesKg[1] < temporalDifferencesKg[0]);
assert.ok(spatialDifferencesKg[1] < spatialDifferencesKg[0]);
assert.ok(temporalDifferencesKg[1] < 0.001);

function damBreak(cells) {
  const container = { widthMeters: 2, heightMeters: 1, depthMeters: 0.1, fillFraction: 0.05 };
  const policy = base.dynamics, initial = physics.createActivityLiquid(container, cells);
  initial.depthMeters = Array.from({ length: cells }, (_, i) => i < cells / 2 ? 0.1 : 0);
  const time = 0.15, result = physics.stepActivityLiquid(initial, container,
    { angleRadians: 0, acceleration: [0, 0], position: [0, 0], velocity: [0, 0], angularVelocity: 0, angularAcceleration: 0, mouth: null }, time, policy);
  const c = Math.sqrt(policy.gravityMetersPerSecondSquared * 0.1);
  const l1DepthErrorMeters = result.depthMeters.reduce((error, depth, i) => {
    const xi = ((i + 0.5) * container.widthMeters / cells - 1) / time;
    const exact = xi <= -c ? 0.1 : xi >= 2 * c ? 0 : (2 * c - xi) ** 2 / (9 * policy.gravityMetersPerSecondSquared);
    return error + Math.abs(depth - exact) / cells;
  }, 0);
  const volumeErrorCubicMeters = Math.abs(result.initialVolumeCubicMeters - result.remainingVolumeCubicMeters);
  assert.ok(volumeErrorCubicMeters < 1e-12);
  return { cells, l1DepthErrorMeters, volumeErrorCubicMeters, maxCfl: result.maxCfl };
}
const ritter = [64, 128, 256, 512].map(damBreak);
assert.ok(ritter[1].l1DepthErrorMeters < ritter[0].l1DepthErrorMeters);
assert.ok(ritter[2].l1DepthErrorMeters < ritter[1].l1DepthErrorMeters);
const containerCases = [
  {widthMeters:.08,heightMeters:.12,depthMeters:.08,fillFraction:.4},
  {widthMeters:.12,heightMeters:.15,depthMeters:.1,fillFraction:.65},
  {widthMeters:.06,heightMeters:.1,depthMeters:.06,fillFraction:.3},
].map(container => {
  const environment={angleRadians:.18,acceleration:[.5,.2],position:[0,0],velocity:[0,0],angularVelocity:0,angularAcceleration:0,mouth:null};
  const coarse=physics.stepActivityLiquid(physics.createActivityLiquid(container,256),container,environment,.12,base.dynamics);
  const fine=physics.stepActivityLiquid(physics.createActivityLiquid(container,512),container,environment,.12,base.dynamics);
  const volumeErrorCubicMeters=Math.abs(fine.initialVolumeCubicMeters-fine.remainingVolumeCubicMeters-fine.spilledVolumeCubicMeters);
  const l1DepthErrorMeters=coarse.depthMeters.reduce((sum,h,i)=>sum+Math.abs(h-(fine.depthMeters[2*i]+fine.depthMeters[2*i+1])/2),0)/256;
  const relativeDepthError=l1DepthErrorMeters/(container.heightMeters*container.fillFraction);
  assert.ok(volumeErrorCubicMeters<1e-12);assert.ok(relativeDepthError<.05);
  return {container,environment,seconds:.12,grids:[256,512],volumeErrorCubicMeters,l1DepthErrorMeters,relativeDepthError};
});
const stationary = lab.createSpecFromPrompt('a person holds a phone in the left hand', { deterministicRuntime: true });
let steady = lab.createSimulationState(stationary);
for (let i = 0; i < 60; i++) steady = lab.stepSimulation(steady, stationary, 1 / 60);
const receipt = steady.activity.dynamics, dt = receipt.endTime - receipt.startTime;
const object = stationary.activityProgram.objects[0], actor = stationary.activityProgram.actors[0];
const gripReferenceNewtons = object.massKg * base.dynamics.gravityMetersPerSecondSquared;
const supportReferenceNewtons = (actor.massKg + object.massKg) * base.dynamics.gravityMetersPerSecondSquared;
assert.ok(Math.abs(receipt.objectImpulses[object.id].constraint[1] / dt - gripReferenceNewtons) < 1e-9);
assert.ok(Math.abs(receipt.actorImpulses[actor.id].support[1] / dt - supportReferenceNewtons) < 1e-9);
const runtimeIdentity = fs.readFileSync(path.join(root, 'public/blank/index.html'), 'utf8')
  .match(/name="simulatte-runtime-source" content="([^"]+)"/)?.[1];
assert.deepEqual(sourceHashes(), sources, 'Numerical sources changed during qualification');
const refinementBudget = {relativeSipChange:0.05,absoluteSipChangeKg:0.001,scope:'Numerical stability for inspecting modeled activity, not empirical sip prediction'};
const qualifiedDefaultGrid=spatial.find(row=>row.liquidCells===base.dynamics.liquidCells);
const refinedGrid=spatial.find(row=>row.liquidCells===base.dynamics.liquidCells*2);
const defaultGridChangeKg=Math.abs(qualifiedDefaultGrid.proof.metrics.consumedMassKg-refinedGrid.proof.metrics.consumedMassKg);
console.log(JSON.stringify({spatial:spatial.map(row=>({cells:row.liquidCells,sipKg:row.proof.metrics.consumedMassKg})),defaultGridChangeKg}));
assert.ok(defaultGridChangeKg/refinedGrid.proof.metrics.consumedMassKg<=refinementBudget.relativeSipChange,'Default liquid grid exceeds relative refinement budget');
assert.ok(defaultGridChangeKg<=refinementBudget.absoluteSipChangeKg,'Default liquid grid exceeds absolute refinement budget');
const report = {refinementBudget,defaultGridChangeKg, schema: 'simulatte.activityDynamicsQualification.v1', runtimeIdentity, sources, prompt,
  references: { containerCases, stationary: { gripReferenceNewtons, supportReferenceNewtons }, ritter }, temporal, spatial,
  convergence: { temporalDifferencesKg, spatialDifferencesKg,
    finestGridChangeRelative: spatialDifferencesKg.at(-1) / spatial.at(-1).proof.metrics.consumedMassKg },
  scope: 'Numerical qualification of declared planar driven bodies and hydrostatic depth-averaged liquid. No empirical calibration, 3D fluid validation or COSMI inference.' };
const output = path.join(root, 'artifacts/activity-program/dynamics-qualification.json');
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), references: report.references, convergence: report.convergence }));
