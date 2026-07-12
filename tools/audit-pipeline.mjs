#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_DIR = path.join(ROOT, 'artifacts', 'simulatte-pipeline-audit');
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

function auditOptionsFrom(argv) {
  const options = {
    intentMode: 'model',
    profileDir: path.join(ROOT, 'artifacts', 'model-cache-profile'),
    localPort: 4199,
    writeBaseline: false,
    scoreArgs: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inline] = arg.split('=');
    const readValue = () => inline ?? (argv[++index] || '');
    if (key === '--intent-mode') {
      const value = String(readValue()).trim().toLowerCase();
      options.intentMode = value === 'local' ? 'local' : 'model';
      continue;
    }
    if (key === '--profile-dir') {
      options.profileDir = path.resolve(readValue() || options.profileDir);
      continue;
    }
    if (key === '--local-port') {
      options.localPort = Math.max(1024, Number(readValue() || options.localPort));
      continue;
    }
    if (key === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }
    if (key === '--floor' || key === '--diversity-policy') {
      options.scoreArgs.push(arg);
      if (inline === undefined) options.scoreArgs.push(readValue());
    }
  }
  return options;
}

function outputDirsFor(mode) {
  if (mode === 'local') {
    return {
      live: path.join(AUDIT_DIR, 'local-webgpu'),
      score: path.join(AUDIT_DIR, 'local-score'),
    };
  }
  return {
    live: path.join(AUDIT_DIR, 'live-webgpu'),
    score: path.join(AUDIT_DIR, 'live-score'),
  };
}

function main() {
  const extraArgs = process.argv.slice(2);
  const options = auditOptionsFrom(extraArgs);
  const outputDirs = outputDirsFor(options.intentMode);
  const literalArgs = LITERAL_PROMPTS.flatMap((prompt) => ['--prompt', prompt]);
  const adversarialArgs = ADVERSARIAL_PROMPTS.flatMap((prompt) => ['--prompt', prompt]);
  const extraPromptArgs = promptArgsFrom(extraArgs);
  const visualArgs = [
    'tools/audit-intent-scene-screenshots.mjs',
    '--curated', '8',
    '--broad', '0',
    '--four', '0',
    '--eighty', '0',
    '--intent-mode', options.intentMode,
    '--out', outputDirs.live,
    '--timeout-ms', '45000',
    '--frame-delay-ms', '650',
    '--local-port', String(options.localPort),
    ...adversarialArgs,
    ...literalArgs,
    ...extraPromptArgs,
  ];
  if (options.intentMode === 'model') {
    visualArgs.push('--profile-dir', options.profileDir);
  }
  runNode(visualArgs);
  const scoreArgs = [
    'tools/audit-pipeline-score.mjs',
    '--live-report', path.join(outputDirs.live, 'report.json'),
    '--out', outputDirs.score,
    ...literalArgs,
    ...extraPromptArgs,
    ...options.scoreArgs,
  ];
  if (options.writeBaseline) scoreArgs.push('--write-baseline');
  runNode(scoreArgs);
}

main();
