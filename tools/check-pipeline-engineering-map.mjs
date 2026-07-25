#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pipeline-job-registry.json'), 'utf8'));
const surfaceEvidence = Object.freeze({
  autonomy: {
    focusedTests: ['tests/autonomy.test.cjs'],
    dataValidator: 'npm run check:simulatte',
    browserGate: 'npm run audit:simulatte:browser -- --check',
    evidenceArtifacts: ['artifacts/simulatte-browser-audit/report.json'],
  },
  blank: {
    focusedTests: [
      'tests/physical-compiler-language-grounding.test.cjs',
      'tests/physical-compiler-simulation-visual.test.cjs',
      'tests/physical-compiler-render-proof.test.cjs',
      'tests/physical-compiler-solvers.test.cjs',
      'tests/phase7-pixel-readback.test.cjs',
    ],
    dataValidator: 'npm run check:model-candidates',
    browserGate: 'npm run audit:blank:gold:desktop',
    evidenceArtifacts: ['artifacts/blank-gold-desktop/report.json'],
  },
});

const rows = [];
for (const surface of registry.surfaces || []) {
  const evidence = surfaceEvidence[surface.id];
  if (!evidence) throw new Error(`pipeline engineering map has no evidence policy for ${surface.id}`);
  for (const binding of surface.bindings || []) {
    for (const owner of binding.owners || []) {
      if (!fs.existsSync(path.join(root, owner))) throw new Error(`pipeline owner does not exist: ${owner}`);
    }
    for (const testFile of evidence.focusedTests) {
      if (!fs.existsSync(path.join(root, testFile))) throw new Error(`pipeline focused test does not exist: ${testFile}`);
    }
    rows.push({
      surface: surface.id,
      jobId: binding.jobId,
      owners: binding.owners,
      ...evidence,
    });
  }
}
if (rows.length !== 16) throw new Error(`pipeline engineering map expected 16 surface jobs, received ${rows.length}`);
process.stdout.write(`Pipeline engineering map resolved ${rows.length} jobs with owners, tests, validators, browser gates, and evidence.\n`);
