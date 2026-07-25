#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = require('../public/simulatte/app/world-runtime-script-manifest.js');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const actual = [...html.matchAll(/<script defer src="\.\/([^"?]+)(?:\?[^"]+)?"/g)]
  .map((match) => match[1])
  .filter((scriptPath) => ![
    'simulatte/app/world-runtime-script-manifest.js',
    'simulatte/app/world-runtime-loader.js',
  ].includes(scriptPath));
if (JSON.stringify(actual) !== JSON.stringify(manifest.eager)) {
  throw new Error('World runtime script entrypoint differs from world-runtime-script-manifest.js');
}
if (new Set(manifest.browser).size !== manifest.browser.length) {
  throw new Error('World runtime manifest contains duplicate script paths');
}
for (const stage of ['pageShell', 'selectedProduct', 'requiredContractsAndData', 'selectedRuntime', 'optionalModel']) {
  if (!Array.isArray(manifest.stages[stage]) || !manifest.stages[stage].length) {
    throw new Error(`World runtime manifest stage is empty: ${stage}`);
  }
}
const staged = Object.values(manifest.stages).flat();
if (staged.length !== manifest.browser.length || new Set(staged).size !== staged.length) {
  throw new Error('World runtime manifest stages must partition the browser inventory exactly once');
}
for (const [profileId, pluginIds] of Object.entries(manifest.profilePlugins)) {
  const selected = manifest.forSelection({ profileId });
  const selectedPluginPaths = selected.filter((scriptPath) => scriptPath.startsWith('shared/plugins/'));
  if (!selectedPluginPaths.length || selectedPluginPaths.some((scriptPath) => !pluginIds.some((id) => scriptPath.startsWith(`shared/plugins/${id}/`)))) {
    throw new Error(`World runtime profile ${profileId} includes the wrong plugin scripts`);
  }
  if (selected.some((scriptPath) => manifest.stages.optionalModel.includes(scriptPath))) {
    throw new Error(`World runtime profile ${profileId} loads the optional model before consent`);
  }
}
if (/<script defer src="\.\/shared\/plugins\//.test(html)) {
  throw new Error('World HTML eagerly loads plugin scripts');
}
process.stdout.write(`World runtime entrypoint is synchronized (${actual.length} eager scripts, ${manifest.browser.length} inventoried, 5 exclusive stages).\n`);
