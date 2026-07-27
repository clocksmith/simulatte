#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const OUTPUT_ROOT = path.join(ROOT, '.firebase-hosting');
const WORLD_ROOT = path.join(OUTPUT_ROOT, 'world');
const CREATE_ROOT = path.join(OUTPUT_ROOT, 'create');
const CREATE_ENTRIES = Object.freeze([
  'blank',
  'data/pipeline-model-selection.json',
  'data/pipeline-model-selection.schema.json',
  'data/simulatte-compact-classifiers.js',
  'data/simulatte-construction-substrate.js',
  'data/simulatte-embedder',
  'data/simulatte-language-lexicon.js',
  'data/simulatte-universe',
  'shared',
  'vendor',
  'simulatte/language/simulatte-universe-parser.js',
  'favicon.svg',
  'model-selection.css',
  'model-selection.js',
  'neural-model-consent.js',
  'version.json',
]);
const CHECK = process.argv.includes('--check');

function fail(message) {
  throw new Error(`hosting_surface_invalid: ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assertSourceContracts() {
  const blankHtml = fs.readFileSync(path.join(PUBLIC_ROOT, 'blank', 'index.html'), 'utf8');
  const worldHtml = fs.readFileSync(path.join(PUBLIC_ROOT, 'index.html'), 'utf8');
  if (!/<base href="\/blank\/">/.test(blankHtml)) {
    fail('public/blank/index.html must declare /blank/ as its asset base');
  }
  if (!/href="https:\/\/simulatte\.world\/"/.test(blankHtml)) {
    fail('Blank must link back to the canonical world origin');
  }
  if (/href="https:\/\/create\.simulatte\.world\/"/.test(worldHtml)) {
    fail('World must not expose the separate create product in its application chrome');
  }
  for (const entry of CREATE_ENTRIES) {
    if (!fs.existsSync(path.join(PUBLIC_ROOT, entry))) fail(`create asset is missing: public/${entry}`);
  }
}

function assertHostingConfig() {
  const firebase = readJson('firebase.json');
  const hosting = Array.isArray(firebase.hosting) ? firebase.hosting : [];
  const world = hosting.find((entry) => entry.target === 'world');
  const create = hosting.find((entry) => entry.target === 'create');
  if (!world || world.public !== '.firebase-hosting/world') {
    fail('firebase.json must map target world to .firebase-hosting/world');
  }
  if (!create || create.public !== '.firebase-hosting/create') {
    fail('firebase.json must map target create to .firebase-hosting/create');
  }
  const redirect = (world.redirects || []).find((entry) => entry.source === '/blank{,/**}');
  if (!redirect || redirect.destination !== 'https://create.simulatte.world' || redirect.type !== 301) {
    fail('world target must permanently redirect /blank to create.simulatte.world');
  }
  const targets = readJson('.firebaserc').targets?.['simulatte-world']?.hosting || {};
  if (!Array.isArray(targets.world) || targets.world.length !== 1 || targets.world[0] !== 'simulatte-world') {
    fail('.firebaserc must bind world to simulatte-world');
  }
  if (!Array.isArray(targets.create) || targets.create.length !== 1 || targets.create[0] !== 'simulatte-create') {
    fail('.firebaserc must bind create to simulatte-create');
  }
}

function resetOutput() {
  const resolved = path.resolve(OUTPUT_ROOT);
  if (resolved !== path.join(ROOT, '.firebase-hosting')) fail('refusing to reset unexpected output root');
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyTree(source, destination, filter = () => true, relativePath = '') {
  const info = fs.statSync(source);
  if (!filter(relativePath, info)) return;
  if (info.isFile()) {
    copyFile(source, destination);
    return;
  }
  if (!info.isDirectory()) fail(`unsupported source entry: ${path.relative(ROOT, source)}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source).sort()) {
    const childRelative = relativePath ? `${relativePath}/${name}` : name;
    copyTree(path.join(source, name), path.join(destination, name), filter, childRelative);
  }
}

function writeCreateEntrypoint() {
  const source = fs.readFileSync(path.join(PUBLIC_ROOT, 'blank', 'index.html'), 'utf8');
  fs.writeFileSync(path.join(CREATE_ROOT, 'index.html'), source);
}

function inventory(surfaceRoot, id) {
  const rows = [];
  function walk(directory, relativeDirectory = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const info = fs.statSync(absolute);
      if (info.isDirectory()) walk(absolute, relative);
      else if (info.isFile() && relative !== 'hosting-surface.json') {
        rows.push({
          path: relative,
          bytes: info.size,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        });
      }
      else if (!info.isFile()) fail(`packaged surface contains unsupported entry: ${id}/${relative}`);
    }
  }
  walk(surfaceRoot);
  const content = rows.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n');
  return {
    schema: 'simulatte.hostingSurface.v1',
    id,
    sourceRoot: 'public',
    entrypoint: 'index.html',
    fileCount: rows.length,
    totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    inventorySha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function writeInventory(surfaceRoot, id) {
  const receipt = inventory(surfaceRoot, id);
  fs.writeFileSync(path.join(surfaceRoot, 'hosting-surface.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function packageSurfaces() {
  resetOutput();
  copyTree(PUBLIC_ROOT, WORLD_ROOT, (relative) => relative !== 'blank' && !relative.startsWith('blank/'));
  fs.mkdirSync(CREATE_ROOT, { recursive: true });
  for (const entry of CREATE_ENTRIES) {
    copyTree(path.join(PUBLIC_ROOT, entry), path.join(CREATE_ROOT, entry), () => true, entry);
  }
  writeCreateEntrypoint();
  const receipts = [
    writeInventory(WORLD_ROOT, 'simulatte-world'),
    writeInventory(CREATE_ROOT, 'simulatte-create'),
  ];
  for (const receipt of receipts) {
    process.stdout.write(`${receipt.id}: ${receipt.fileCount} files, ${receipt.totalBytes} bytes, ${receipt.inventorySha256}\n`);
  }
}

try {
  assertSourceContracts();
  assertHostingConfig();
  if (CHECK) {
    process.stdout.write('Hosting surface contracts are valid.\n');
  } else {
    packageSurfaces();
  }
} catch (error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
