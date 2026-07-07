#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-pipeline-audit', 'live-webgpu');
const SCORE_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-pipeline-audit', 'live-score');
const LITERAL_PROMPTS = Object.freeze([
  'dogs',
  'flowers',
  'trees and mountaints',
  'dogs and cats swimming',
]);
const ADVERSARIAL_PROMPTS = Object.freeze([
  'warehouse fire with smoke in concrete stairwell and renderer layers soot',
  'warehouse robot arms sort parcels on conveyor belts',
  'protein folding with bond constraints and energy minimization',
  'robot gripper twists a protein sample holder without molecular folding',
  'qubit chip phase readout through microwave resonator',
  'phase study in a generic lab with no qubits or quantum hardware',
  'glacier calving into fjord with sea ice waves',
  'forest fire jumps a road under wind shear',
]);

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function promptArgsFrom(argv) {
  const prompts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--prompt') {
      const value = argv[index + 1] || '';
      if (value) prompts.push('--prompt', value);
      index += 1;
    } else if (arg.startsWith('--prompt=')) {
      const value = arg.slice('--prompt='.length);
      if (value) prompts.push('--prompt', value);
    }
  }
  return prompts;
}

function main() {
  const extraArgs = process.argv.slice(2);
  const literalArgs = LITERAL_PROMPTS.flatMap((prompt) => ['--prompt', prompt]);
  const adversarialArgs = ADVERSARIAL_PROMPTS.flatMap((prompt) => ['--prompt', prompt]);
  const extraPromptArgs = promptArgsFrom(extraArgs);
  runNode([
    'tools/audit-intent-scene-screenshots.mjs',
    '--curated', '8',
    '--broad', '0',
    '--four', '0',
    '--eighty', '0',
    '--intent-mode', 'local',
    '--out', LIVE_OUT_DIR,
    '--timeout-ms', '45000',
    '--frame-delay-ms', '650',
    ...adversarialArgs,
    ...literalArgs,
    ...extraPromptArgs,
  ]);
  runNode([
    'tools/audit-pipeline-score.mjs',
    '--live-report', path.join(LIVE_OUT_DIR, 'report.json'),
    '--out', SCORE_OUT_DIR,
    ...literalArgs,
    ...extraArgs,
  ]);
}

main();
