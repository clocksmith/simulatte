#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOSTING_SURFACES, parseSurfaceArgs, requireDirectory, sourceFiles } from './hosting-surface-inputs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  throw new Error(`hosting_surface_invalid: ${message}`);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertSourceContracts(root, surfaces) {
  const publicRoot = path.join(root, 'public');
  sourceFiles(publicRoot, ['blank/index.html', 'index.html']);
  const blankHtml = fs.readFileSync(path.join(publicRoot, 'blank', 'index.html'), 'utf8');
  const worldHtml = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  if (!/<base href="\/blank\/">/.test(blankHtml)) {
    fail('public/blank/index.html must declare /blank/ as its asset base');
  }
  if (!/href="https:\/\/simulatte\.world\/"/.test(blankHtml)) {
    fail('Blank must link back to the canonical world origin');
  }
  if (!/href="https:\/\/create\.simulatte\.world\/"/.test(worldHtml)) {
    fail('World must link to the canonical separate Create product');
  }
  for (const entry of surfaces.flatMap(surface => HOSTING_SURFACES[surface].entries)) {
    if (!fs.existsSync(path.join(publicRoot, entry))) fail(`hosting asset is missing: public/${entry}`);
  }
}

function assertHostingConfig(root) {
  const firebase = readJson(root, 'firebase.json');
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
  const targets = readJson(root, '.firebaserc').targets?.['simulatte-world']?.hosting || {};
  if (!Array.isArray(targets.world) || targets.world.length !== 1 || targets.world[0] !== 'simulatte-world') {
    fail('.firebaserc must bind world to simulatte-world');
  }
  if (!Array.isArray(targets.create) || targets.create.length !== 1 || targets.create[0] !== 'simulatte-create') {
    fail('.firebaserc must bind create to simulatte-create');
  }
}

function assertReleaseIdentity(publicRoot, surfaces) {
  const version = JSON.parse(fs.readFileSync(path.join(publicRoot, 'version.json'), 'utf8'));
  if (typeof version.build !== 'string' || !version.build) fail('version.json must contain a build identity');
  for (const surface of surfaces) {
    for (const entrypoint of HOSTING_SURFACES[surface].entrypoints) {
      const html = fs.readFileSync(path.join(publicRoot, entrypoint), 'utf8');
      const build = /<meta\s+name="simulatte-build"\s+content="([^"]*)"\s*\/?>/i.exec(html)?.[1];
      if (build !== version.build) fail(`${surface} entrypoint ${entrypoint} is not stamped for public/version.json; run prepare:hosting${surfaces.length === 1 ? `:${surface}` : ''}`);
    }
  }
}

function inspectOutput(directory, files = new Map(), relativeDirectory = '') {
  requireDirectory(directory);
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
    const info = fs.lstatSync(absolute);
    if (info.isDirectory()) inspectOutput(absolute, files, relative);
    else if (info.isFile()) files.set(relative, info);
    else fail(`packaged surface contains unsupported entry: ${absolute}`);
  }
  return files;
}

function writeChanged(destination, bytes, beforeChange = () => {}) {
  if (fs.existsSync(destination) && fs.lstatSync(destination).nlink === 1 && fs.readFileSync(destination).equals(bytes)) return false;
  // Rename a new independent file instead of changing a potentially hard-linked
  // snapshot in place. A failed write leaves the previous destination intact.
  beforeChange();
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.hosting-write-'));
  try {
    const file = path.join(temporary, 'content');
    fs.writeFileSync(file, bytes);
    fs.renameSync(file, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return true;
}

function syncSurface(publicRoot, surfaceRoot, surface, sources) {
  fs.mkdirSync(surfaceRoot, { recursive: true });
  inspectOutput(surfaceRoot);
  const expected = new Map(sources.map(relative => [relative, relative]));
  if (surface === 'create') expected.set('index.html', 'blank/index.html');
  if (expected.has('hosting-surface.json')) fail('public/hosting-surface.json is reserved for the package receipt');
  const receiptPath = path.join(surfaceRoot, 'hosting-surface.json');
  if (fs.existsSync(receiptPath) && !fs.lstatSync(receiptPath).isFile()) fail(`expected a regular receipt file: ${receiptPath}`);
  const invalidateReceipt = () => {
    if (fs.existsSync(receiptPath)) fs.unlinkSync(receiptPath);
  };
  const directories = new Set();
  for (const relative of expected.keys()) {
    let directory = path.posix.dirname(relative);
    while (directory !== '.') { directories.add(directory); directory = path.posix.dirname(directory); }
  }
  let removed = 0;
  function prune(directory, relativeDirectory = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      if (relative === 'hosting-surface.json') continue;
      if (fs.lstatSync(absolute).isDirectory()) {
        prune(absolute, relative);
        if (!directories.has(relative)) fs.rmdirSync(absolute);
      } else if ((!expected.has(relative) && relative !== 'hosting-surface.json') || directories.has(relative)) {
        invalidateReceipt();
        fs.unlinkSync(absolute);
        removed += 1;
      }
    }
  }
  prune(surfaceRoot);
  for (const directory of directories) fs.mkdirSync(path.join(surfaceRoot, directory), { recursive: true });
  let changed = 0;
  const rows = new Map();
  for (const [relative, source] of expected) {
    const bytes = fs.readFileSync(path.join(publicRoot, source));
    if (writeChanged(path.join(surfaceRoot, relative), bytes, invalidateReceipt)) changed += 1;
    rows.set(relative, {
      path: relative,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
  // Retain v1's sorted directory-walk ordering without hashing/copying outputs
  // again. Every retained destination was compared against these exact bytes.
  const ordered = [...inspectOutput(surfaceRoot).keys()].filter(relative => relative !== 'hosting-surface.json').map(relative => rows.get(relative));
  const content = ordered.map(row => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n');
  const receipt = {
    schema: 'simulatte.hostingSurface.v1',
    id: HOSTING_SURFACES[surface].id,
    sourceRoot: 'public',
    entrypoint: 'index.html',
    fileCount: ordered.length,
    totalBytes: ordered.reduce((sum, row) => sum + row.bytes, 0),
    inventorySha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
  const receiptChanged = writeChanged(path.join(surfaceRoot, 'hosting-surface.json'), Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`));
  return { surface, receipt, changed, unchanged: expected.size - changed, removed, receiptChanged };
}

export function packageSurfaces({ root = ROOT, outputRoot = path.join(root, '.firebase-hosting'), surfaces = ['world', 'create'], check = false } = {}) {
  for (const surface of surfaces) if (!Object.hasOwn(HOSTING_SURFACES, surface)) fail(`unknown surface: ${surface}`);
  const publicRoot = path.join(root, 'public');
  requireDirectory(publicRoot);
  assertSourceContracts(root, surfaces);
  assertHostingConfig(root);
  const inputs = new Map(surfaces.map(surface => {
    const { entries, excludes } = HOSTING_SURFACES[surface];
    return [surface, sourceFiles(publicRoot, entries, excludes)];
  }));
  if (check) return [];
  assertReleaseIdentity(publicRoot, surfaces);
  // The CLI always supplies its own .firebase-hosting directory. An explicit
  // outputRoot lets tests build real sources in isolated temporary snapshots.
  outputRoot = path.resolve(outputRoot);
  let ancestor = path.dirname(outputRoot);
  while (ancestor !== path.dirname(ancestor)) { requireDirectory(ancestor); ancestor = path.dirname(ancestor); }
  if (fs.existsSync(outputRoot)) requireDirectory(outputRoot);
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const surface of surfaces) {
    const surfaceRoot = path.join(outputRoot, surface);
    if (fs.existsSync(surfaceRoot)) inspectOutput(surfaceRoot);
  }
  return surfaces.map(surface => syncSurface(publicRoot, path.join(outputRoot, surface), surface, inputs.get(surface)));
}

export function main(args = process.argv.slice(2)) {
  const { surfaces, check } = parseSurfaceArgs(args, { allowCheck: true });
  const results = packageSurfaces({ surfaces, check });
  if (check) process.stdout.write('Hosting surface contracts are valid.\n');
  for (const { receipt, changed, unchanged, removed, receiptChanged } of results) {
    process.stdout.write(`${receipt.id}: ${receipt.fileCount} files, ${receipt.totalBytes} bytes, ${receipt.inventorySha256}; changed=${changed} unchanged=${unchanged} removed=${removed} receiptChanged=${receiptChanged}\n`);
  }
  if (!check && surfaces.length === 1) process.stdout.write(`Not prepared: ${Object.keys(HOSTING_SURFACES).filter(surface => !surfaces.includes(surface)).join(', ')}. Its output is untouched, not verified current; shared changes require preparing both surfaces.\n`);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}
