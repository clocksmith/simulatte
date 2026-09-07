import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, '..');
const htmlPath = path.join(repoRoot, 'public', 'blank', 'index.html');
const manifestPath = path.join(
  repoRoot,
  'public',
  'blank',
  'app',
  'runtime-script-manifest.js'
);
const START = '<!-- SIMULATTE_RUNTIME_SCRIPTS_START -->';
const END = '<!-- SIMULATTE_RUNTIME_SCRIPTS_END -->';

function runtimeScriptBlock(html, browserScripts) {
  const buildStamp = html.match(/<meta name="simulatte-build" content="([^"]+)">/)?.[1];
  if (!buildStamp) throw new Error(`Missing simulatte-build meta in ${htmlPath}`);
  const paths = [
    'app/runtime-script-manifest.js',
    ...browserScripts,
    'app/main.js',
    'app/version-guard.js',
  ];
  const tags = paths.map((relativePath) => {
    const src = relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
    return `  <script defer src="${src}?v=${buildStamp}"></script>`;
  });
  const sourceFiles = [...new Set([...paths, ...manifest.pipelineWorker,
    'app/workers/simulatte-pipeline-worker.js', 'app/workers/simulatte-worker-bootstrap.js',
    '../data/create-phase-run-policy.json'])].sort();
  const sourceIdentity = sourceFiles.map(file => ({ file,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, 'public/blank', file))).digest('hex') }));
  const buildDigest = crypto.createHash('sha256').update(JSON.stringify(sourceIdentity)).digest('hex');
  return [START, `  <meta name="simulatte-runtime-source" content="sha256:${buildDigest}">`, ...tags, `  ${END}`].join('\n');
}

function replaceGeneratedBlock(html, block) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) {
    throw new Error(`Missing runtime script markers in ${htmlPath}`);
  }
  return `${html.slice(0, start)}${block}${html.slice(end + END.length)}`;
}

const write = process.argv.includes('--write');
const require = createRequire(import.meta.url);
delete require.cache[require.resolve(manifestPath)];
const manifest = require(manifestPath);
const html = fs.readFileSync(htmlPath, 'utf8');
const expected = replaceGeneratedBlock(html, runtimeScriptBlock(html, manifest.browser));

if (expected === html) {
  process.stdout.write('runtime script entrypoint is synchronized\n');
} else if (write) {
  fs.writeFileSync(htmlPath, expected);
  process.stdout.write('wrote public/blank/index.html runtime script entrypoint\n');
} else {
  throw new Error(
    'public/blank/index.html runtime scripts differ from runtime-script-manifest.js; run npm run sync:runtime-entrypoint'
  );
}
