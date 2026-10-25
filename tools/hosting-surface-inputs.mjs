import fs from 'node:fs';
import path from 'node:path';

// These are packaging boundaries, not validator dependency closures. Shared
// inputs deliberately remain in both snapshots; no offline datasets move out.
export const HOSTING_SURFACES = Object.freeze({
  world: Object.freeze({
    id: 'simulatte-world',
    entries: Object.freeze(['.']),
    excludes: Object.freeze(['blank']),
    entrypoints: Object.freeze([
      'index.html',
      'simulatte/field-experiments/index.html',
      'simulatte/distributed-repair/index.html',
      'simulatte/distributed-repair/repair.html',
      'simulatte/system-diagram/index.html',
    ]),
  }),
  create: Object.freeze({
    id: 'simulatte-create',
    entries: Object.freeze([
      'blank',
      'data/create-phase-run-policy.json',
      'data/pipeline-model-selection.json',
      'data/pipeline-model-selection.schema.json',
      'data/simulatte-compact-classifiers.js',
      'data/simulatte-construction-substrate.js',
      'data/simulatte-embedder',
      'data/simulatte-language-lexicon.js',
      'data/simulatte-universe',
      'shared',
      'vendor',
      'simulatte/language/simulatte-language-structure.js',
      'simulatte/language/simulatte-universe-parser.js',
      'favicon.svg',
      'model-selection.css',
      'model-selection.js',
      'neural-model-consent.js',
      'version.json',
    ]),
    excludes: Object.freeze([]),
    entrypoints: Object.freeze(['blank/index.html']),
  }),
});

export const ENTRYPOINTS = Object.freeze(Object.values(HOSTING_SURFACES).flatMap(surface => surface.entrypoints));

export function selectedSurfaces(surface = 'both') {
  if (surface === 'both') return Object.keys(HOSTING_SURFACES);
  if (!Object.hasOwn(HOSTING_SURFACES, surface)) throw new Error(`Unknown hosting surface: ${surface}; expected world, create or both`);
  return [surface];
}

export function parseSurfaceArgs(args, { allowCheck = false } = {}) {
  const options = { surface: 'both', check: false };
  let selected = false;
  for (const arg of args) {
    if (allowCheck && arg === '--check') { options.check = true; continue; }
    if (arg.startsWith('--surface=') && !selected) {
      options.surface = arg.slice('--surface='.length);
      selected = true;
    } else throw new Error(`Unknown or repeated argument: ${arg}`);
  }
  options.surfaces = selectedSurfaces(options.surface);
  return options;
}

export function requireDirectory(directory) {
  const info = fs.lstatSync(directory);
  if (!info.isDirectory()) throw new Error(`Expected a regular directory, not a symlink or other entry: ${directory}`);
}

// lstat each component before walking so an allowlisted nested entry cannot
// traverse a symlink in its parent. Fail before changing any output.
export function sourceFiles(publicRoot, entries = ['.'], excludes = []) {
  requireDirectory(publicRoot);
  const files = new Set();
  function walk(relative) {
    if (excludes.some(entry => relative === entry || relative.startsWith(`${entry}/`))) return;
    const absolute = path.join(publicRoot, relative);
    const info = fs.lstatSync(absolute);
    if (info.isFile()) files.add(relative);
    else if (info.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) walk(relative === '.' ? name : `${relative}/${name}`);
    } else throw new Error(`Unsupported hosting source entry: ${absolute}`);
  }
  for (const entry of entries) {
    const parts = entry.split('/');
    if (path.isAbsolute(entry) || parts.includes('..')) throw new Error(`Invalid hosting source entry: ${entry}`);
    for (let index = 1; index < parts.length; index += 1) requireDirectory(path.join(publicRoot, ...parts.slice(0, index)));
    walk(entry);
  }
  return [...files];
}
