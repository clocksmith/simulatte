import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lab = require('../public/blank/app/simulation/simulation-lab.js');
const baseline = '8819730c';
// Development examples and different composition families are deliberately separate.
// Once inspected, evaluation rows are diagnostic regressions, never sealed/unseen claims.
const development = [
  ['walk', 'a person walks'], ['sit', 'a person sits on a chair'],
  ['hold', 'a person holds a cup in the left hand'], ['drink', 'a person drinks from a cup with the right hand'],
  ['walk+hold', 'a person walking while holding a cup in the left hand'],
  ['sit+hold+drink', 'a person sits on a chair, holds a phone in the left hand, and drinks from a cup with the right hand'],
];
const evaluation = [
  ['walk+drink', 'a person walks while drinking from a cup with the left hand'],
  ['sit+hold', 'a person sits on a chair while holding a phone in the right hand'],
  ['sit+drink', 'a person sits on a chair while drinking from a cup with the left hand'],
];
const legacy = ['dogs and cats swimming', 'a red cup on a table',
  'warehouse robot arms sort parcels on conveyor belts', 'forest fire jumps a road under wind shear'];
function execute(prompt) {
  const start = performance.now(), spec = lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
  const compileMs = performance.now() - start;
  let state = lab.createSimulationState(spec);
  const end = Math.max(0, ...spec.activityProgram.actions.map(action => action.endSeconds));
  const runStart = performance.now();
  for (let i = 0; i < Math.ceil(end * 60) + 1; i++) state = lab.stepSimulation(state, spec, 1 / 60);
  const proof = lab.proveActivitySequence(spec.activityProgram, state.activity);
  assert.equal(proof.pass, true, `${prompt}: ${JSON.stringify(proof)}`);
  return { prompt, programHash: spec.activityProgram.contentHash,
    phaseSchemas: Object.values(spec.phaseArtifacts).map(row => row.schema),
    actions: spec.activityProgram.actions.map(row => row.action), proof,
    resources: { compileMs, executionMs: performance.now() - runStart,
      actorCount: spec.activityProgram.actors.length, actionCount: spec.activityProgram.actions.length,
      retainedFrames: state.activity.history.length, limits: spec.activityProgram.limits } };
}
function legacySignature(spec) {
  return {
    nodes: spec.universeGraph.nodes.map(({ id, canonicalId, type, label, cardinality }) => ({ id, canonicalId, type, label, cardinality })),
    geometry: spec.renderProgram.sceneRenderPacket.entities.map(entity => ({ id: entity.id, identity: entity.identity.type,
      grammar: entity.geometry.program.grammarId, parts: entity.geometry.program.parts.map(part => ({
        id: part.id, primitive: part.primitive, center: part.center, size: part.size, rotation: part.rotation })) })),
  };
}
const rows = [...development.map(([family, prompt]) => ({ partition: 'development', family, ...execute(prompt) })),
  ...evaluation.map(([family, prompt]) => ({ partition: 'evaluation-diagnostic', family, ...execute(prompt) }))];
assert.ok(evaluation.every(([family]) => !development.some(([other]) => family === other)));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-activity-baseline-'));
let comparisons;
try {
  const archive = path.join(directory, 'baseline.tar');
  execFileSync('git', ['archive', baseline, 'public', '--output', archive], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', directory]);
  const source = `const lab = require('./public/blank/app/simulation/simulation-lab.js');
    const fs = require('node:fs');
    const signature = ${legacySignature.toString()};
    process.stdout.write(JSON.stringify(${JSON.stringify(legacy)}.map((prompt, index) => {
      const spec = lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
      const imports = ['retained', 'compact'].map(format => {
        const text = lab.serializeSpec(spec, { retainPhaseSources: format === 'retained' });
        fs.writeFileSync('legacy-' + index + '-' + format + '.json', text);
        try { lab.deserializeSpec(text); return { format, accepted: true }; }
        catch(error) { return { format, accepted: false, code: error.code, reason: error.message }; }
      });
      return { signature: signature(spec), imports };
    })));`;
  const old = JSON.parse(execFileSync(process.execPath, ['-e', source], { cwd: directory, maxBuffer: 16 * 1024 * 1024 }));
  comparisons = legacy.map((prompt, index) => {
    const current = JSON.parse(JSON.stringify(legacySignature(lab.createSpecFromPrompt(prompt, { deterministicRuntime: true }))));
    assert.deepEqual(current, old[index].signature, `Legacy entity/geometry regression: ${prompt}`);
    const imports = ['retained', 'compact'].map(format => {
      const text = fs.readFileSync(path.join(directory, `legacy-${index}-${format}.json`), 'utf8');
      const raw = JSON.parse(text), expected = old[index].imports.find(row => row.format === format);
      let imported;
      try { imported = lab.deserializeSpec(text); }
      catch (error) {
        assert.equal(expected.accepted, false, `Legacy ${format} import regressed: ${prompt}: ${error.message}`);
        assert.equal(error.code, expected.code); assert.equal(error.message, expected.reason);
        return { format, accepted: false, baselineRejectionPreserved: true, reason: error.message };
      }
      assert.equal(expected.accepted, true, `Legacy ${format} import unexpectedly bypassed a baseline refusal: ${prompt}`);
      assert.equal(imported.contentHash, raw.contentHash, `Legacy ${format} import identity: ${prompt}`);
      assert.equal(Object.hasOwn(imported, 'activityProgram'), false);
      const state = lab.stepSimulation(lab.createSimulationState(imported), imported, 1 / 60);
      assert.ok(state.t > 0);
      const roundtrip = lab.deserializeSpec(lab.serializeSpec(imported, { retainPhaseSources: format === 'retained' }));
      assert.equal(roundtrip.contentHash, raw.contentHash);
      return { format, accepted: true, contentHash: raw.contentHash, import: true, step: true, roundtrip: true };
    });
    return { prompt, matches: true, compared: ['participant identities/counts', 'part identities/primitives/transforms'], imports };
  });
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
const out = path.join(root, 'artifacts', 'activity-program');
fs.mkdirSync(out, { recursive: true });
const report = { schema: 'simulatte.activityQualification.v1', baseline, execution: 'Node procedural kinematics',
  evaluationMeaning: 'different composition families, now retained diagnostic cases; no sealed generalization claim', rows, legacy: comparisons };
fs.writeFileSync(path.join(out, 'qualification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ activityCases: rows.length, passed: rows.filter(row => row.proof.pass).length,
  legacyCases: comparisons.length, baseline, report: 'artifacts/activity-program/qualification.json' }));
