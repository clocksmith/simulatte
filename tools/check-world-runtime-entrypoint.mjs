#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = require('../public/simulatte/app/world-runtime-script-manifest.js');
const htmlPath = path.join(root, 'public/index.html');
const START = '<!-- SIMULATTE_WORLD_RUNTIME_SCRIPTS_START -->';
const END = '<!-- SIMULATTE_WORLD_RUNTIME_SCRIPTS_END -->';
const write = process.argv.includes('--write');
let html = fs.readFileSync(htmlPath, 'utf8');
let actual = eagerScripts(html);
if (write && html !== synchronizeHtml(html, manifest.eager)) {
  html = synchronizeHtml(html, manifest.eager);
  fs.writeFileSync(htmlPath, html);
  actual = eagerScripts(html);
  process.stdout.write('Wrote public/index.html World runtime script entrypoint.\n');
}

function eagerScripts(source) {
  return [...source.matchAll(/<script defer src="\.\/([^"?]+)(?:\?[^\"]+)?"/g)]
    .map((match) => match[1])
    .filter((scriptPath) => ![
      'simulatte/app/world-runtime-script-manifest.js',
      'simulatte/app/world-runtime-loader.js',
    ].includes(scriptPath));
}

function synchronizeHtml(source, eager) {
  const buildStamp = source.match(/<meta name="simulatte-build" content="([^"]+)">/)?.[1];
  if (!buildStamp) throw new Error('World entrypoint is missing the simulatte-build identity');
  const lines = [START, scriptTag('simulatte/app/world-runtime-script-manifest.js', buildStamp), scriptTag('simulatte/app/world-runtime-loader.js', buildStamp)];
  eager.forEach((scriptPath) => {
    lines.push(scriptTag(scriptPath, buildStamp));
  });
  lines.push('  <!-- generated-plugin-scripts:start -->');
  lines.push('  <!-- Selected plugin scripts are loaded by world-runtime-loader.js after route selection. -->');
  lines.push('  <!-- generated-plugin-scripts:end -->');
  lines.push(END);
  const block = lines.join('\n');
  const markedStart = source.indexOf(START);
  const markedEnd = source.indexOf(END);
  if (markedStart >= 0 && markedEnd > markedStart) {
    return `${source.slice(0, markedStart)}${block}${source.slice(markedEnd + END.length)}`;
  }
  const first = source.match(/  <script defer src="\.\/simulatte\/app\/world-runtime-script-manifest\.js\?[^\"]+"><\/script>/);
  const main = source.match(/  <script defer src="\.\/simulatte\/app\/main\.js\?[^\"]+"><\/script>/);
  if (!first || first.index === undefined || !main || main.index === undefined) {
    throw new Error('World entrypoint script boundaries are missing');
  }
  return `${source.slice(0, first.index)}${block}${source.slice(main.index + main[0].length)}`;
}

function scriptTag(scriptPath, buildStamp) {
  return `  <script defer src="./${scriptPath}?v=${buildStamp}"></script>`;
}

if (JSON.stringify(actual) !== JSON.stringify(manifest.eager)) {
  throw new Error('World runtime script entrypoint differs from world-runtime-script-manifest.js; run npm run sync:world-entrypoint');
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
