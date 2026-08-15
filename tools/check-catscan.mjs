#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const DEFAULT_INDEX_PATH = 'docs/component-index.md';
const MAX_WORDS = 300;
const IGNORED_DIRECTORIES = new Set([
  '.firebase-hosting',
  '.git',
  'artifacts',
  'node_modules',
]);
const REQUIRED_SECTIONS = [
  'Authority',
  'Scope',
  'Inputs',
  'Outputs',
  'Invariants',
  'Acceptance',
  'Non-goals',
  'Freedom',
];
const LINKED_SECTIONS = ['Inputs', 'Outputs', 'Acceptance'];

function fail(message) {
  const error = new Error(`catscan_invalid: ${message}`);
  error.code = 'catscan_invalid';
  throw error;
}

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    indexPath: DEFAULT_INDEX_PATH,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--root') options.root = path.resolve(value());
    else if (key === '--index') options.indexPath = value();
    else if (key === '--write') options.write = true;
    else if (key === '--help') {
      process.stdout.write('usage: node tools/check-catscan.mjs [--root PATH] [--index PATH] [--write]\n');
      process.exit(0);
    } else fail(`unknown argument ${argv[index]}`);
  }
  return options;
}

function discoverCatscanPaths(root) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && entry.name === 'CATSCAN.md') {
        paths.push(normalizeRelative(path.relative(root, absolutePath)));
      }
    }
  };
  visit(root);
  return paths.sort((left, right) => (
    left.split('/').length - right.split('/').length || left.localeCompare(right)
  ));
}

function parseLinks(text) {
  return [...text.matchAll(/\[([^\]]+)]\(([^)]+)\)/g)].map((match) => ({
    label: match[1].trim(),
    target: match[2].trim(),
  }));
}

function sectionBody(text, section) {
  const marker = `## ${section}`;
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const next = text.indexOf('\n## ', bodyStart);
  return text.slice(bodyStart, next < 0 ? text.length : next).trim();
}

function topField(text, name, relativePath) {
  const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  if (!match) fail(`${relativePath} is missing ${name}:`);
  return match[1].trim();
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripCode(value) {
  return value.replace(/^`|`$/g, '').trim();
}

function resolveLocalLink(root, relativePath, target) {
  if (/^(?:[a-z]+:|#)/i.test(target)) return null;
  const withoutFragment = target.split('#')[0].split('?')[0];
  if (!withoutFragment) return null;
  return path.resolve(root, path.dirname(relativePath), decodeURIComponent(withoutFragment));
}

function validateLocalLinks(root, charter) {
  for (const section of LINKED_SECTIONS) {
    const body = charter.sections[section];
    const links = parseLinks(body);
    if (!links.length) fail(`${charter.path} ${section} must declare a local contract or evidence link`);
    for (const link of links) {
      const resolved = resolveLocalLink(root, charter.path, link.target);
      if (!resolved) fail(`${charter.path} ${section} link must be repository-local: ${link.target}`);
      if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
        fail(`${charter.path} link escapes the repository: ${link.target}`);
      }
      if (!fs.existsSync(resolved)) fail(`${charter.path} link does not exist: ${link.target}`);
    }
  }
}

function parseCatscan(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const title = text.match(/^# CATSCAN:\s*(.+)$/m)?.[1]?.trim();
  if (!title) fail(`${relativePath} must start with # CATSCAN: <Component>`);
  if (wordCount(text) > MAX_WORDS) fail(`${relativePath} exceeds ${MAX_WORDS} words`);
  const component = stripCode(topField(text, 'Component', relativePath));
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(component)) {
    fail(`${relativePath} has invalid component identifier ${component}`);
  }
  const parent = topField(text, 'Parent', relativePath);
  const target = topField(text, 'Target', relativePath);
  const sections = Object.fromEntries(REQUIRED_SECTIONS.map((section) => {
    const body = sectionBody(text, section);
    if (!body) fail(`${relativePath} is missing or has empty ## ${section}`);
    return [section, body];
  }));
  let previous = -1;
  for (const section of REQUIRED_SECTIONS) {
    const offset = text.indexOf(`## ${section}`);
    if (offset <= previous) fail(`${relativePath} sections are not in the required order`);
    previous = offset;
  }
  if (!sections.Authority.includes('- Owns ')) fail(`${relativePath} Authority must declare - Owns`);
  if (!sections.Authority.includes('- Does not own ')) fail(`${relativePath} Authority must declare - Does not own`);
  if (!sections.Acceptance.match(/^- Evidence:\s*\[[^\]]+]\([^)]+\)/m)) {
    fail(`${relativePath} Acceptance must declare - Evidence: [label](path)`);
  }
  if (!sections.Freedom.includes('Any mechanism is permitted')) {
    fail(`${relativePath} Freedom must preserve implementation freedom`);
  }
  const parentLinks = parseLinks(parent);
  return {
    component,
    directory: normalizeRelative(path.dirname(relativePath)) === '.' ? '.' : normalizeRelative(path.dirname(relativePath)),
    parent,
    parentLink: parentLinks.length === 1 ? parentLinks[0] : null,
    path: relativePath,
    sections,
    target,
    title,
    wordCount: wordCount(text),
  };
}

function expectedParentPath(charter, charterPaths) {
  if (charter.path === 'CATSCAN.md') return null;
  let directory = path.posix.dirname(charter.path);
  while (directory !== '.') {
    directory = path.posix.dirname(directory);
    const candidate = directory === '.' ? 'CATSCAN.md' : `${directory}/CATSCAN.md`;
    if (charterPaths.has(candidate)) return candidate;
  }
  return charterPaths.has('CATSCAN.md') ? 'CATSCAN.md' : null;
}

function validateParents(root, charters) {
  const paths = new Set(charters.map((charter) => charter.path));
  for (const charter of charters) {
    const expected = expectedParentPath(charter, paths);
    if (!expected) {
      if (charter.parent.toLowerCase() !== 'none') fail(`${charter.path} root Parent must be none`);
      continue;
    }
    if (!charter.parentLink) fail(`${charter.path} must declare exactly one Parent link`);
    const resolved = resolveLocalLink(root, charter.path, charter.parentLink.target);
    const actual = normalizeRelative(path.relative(root, resolved));
    if (actual !== expected) {
      fail(`${charter.path} parent is ${actual}; nearest parent is ${expected}`);
    }
  }
}

function validateCatscans(root) {
  const relativePaths = discoverCatscanPaths(root);
  if (!relativePaths.includes('CATSCAN.md')) fail('repository root CATSCAN.md is missing');
  const charters = relativePaths.map((relativePath) => parseCatscan(root, relativePath));
  const identifiers = new Set();
  for (const charter of charters) {
    if (identifiers.has(charter.component)) fail(`duplicate component identifier ${charter.component}`);
    identifiers.add(charter.component);
    validateLocalLinks(root, charter);
  }
  validateParents(root, charters);
  return charters;
}

function escapeTable(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderComponentIndex(charters) {
  const rows = charters.map((charter) => {
    const parent = charter.parentLink ? charter.parentLink.label : 'None';
    const evidence = parseLinks(charter.sections.Acceptance).find((link) => (
      charter.sections.Acceptance.includes(`Evidence: [${link.label}](${link.target})`)
    ));
    return `| \`${charter.component}\` | [\`${charter.directory}\`](${charter.path}) | ${escapeTable(parent)} | ${escapeTable(charter.target)} | [${evidence.label}](${path.posix.join(path.posix.dirname(charter.path), evidence.target)}) |`;
  });
  return [
    '# Simulatte Component Index',
    '',
    'Generated by `npm run catscan:sync`. Do not edit this file directly.',
    '',
    '| Component | Charter | Parent | Target | Acceptance evidence |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function validateIndex(root, indexPath, expected) {
  const absolutePath = path.resolve(root, indexPath);
  if (!fs.existsSync(absolutePath)) fail(`${indexPath} is missing; run npm run catscan:sync`);
  if (fs.readFileSync(absolutePath, 'utf8') !== expected) {
    fail(`${indexPath} is stale; run npm run catscan:sync`);
  }
}

function run(options) {
  const charters = validateCatscans(options.root);
  const index = renderComponentIndex(charters);
  const absoluteIndex = path.resolve(options.root, options.indexPath);
  if (options.write) {
    fs.mkdirSync(path.dirname(absoluteIndex), { recursive: true });
    fs.writeFileSync(absoluteIndex, index);
    process.stdout.write(`CATSCAN index wrote ${options.indexPath} with ${charters.length} components.\n`);
  } else {
    validateIndex(options.root, options.indexPath, index);
    process.stdout.write(`CATSCAN valid: ${charters.length} recursive component charters and synchronized index.\n`);
  }
  return charters;
}

if (process.argv[1] === MODULE_PATH) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  MAX_WORDS,
  discoverCatscanPaths,
  parseCatscan,
  renderComponentIndex,
  run,
  validateCatscans,
  validateIndex,
};
