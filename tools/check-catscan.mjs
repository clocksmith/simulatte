#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = path.join(ROOT, 'docs/simulatte/folder-contract.json');
const REQUIRED = [
  ['CATSCAN.md', 'simulatte.root', '.'],
  ['public/CATSCAN.md', 'simulatte.public', 'public'],
  ['tools/CATSCAN.md', 'simulatte.tools', 'tools'],
  ['tests/CATSCAN.md', 'simulatte.tests', 'tests'],
  ['docs/CATSCAN.md', 'simulatte.docs', 'docs'],
];
const SECTIONS = ['API Surface', 'Internal Dependencies', 'External Dependencies', 'Validation', 'Non-Claims'];

function fail(message) {
  throw new Error(`catscan_invalid: ${message}`);
}

function parseFrontMatter(text, relativePath) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') fail(`${relativePath} must start with YAML front matter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) fail(`${relativePath} front matter is not closed`);
  const fields = Object.create(null);
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (!match) fail(`${relativePath} has malformed front matter: ${line}`);
    fields[match[1]] = match[2].trim();
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

function main() {
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const nodes = new Map(contract.nodes.map((node) => [node.id, node]));
  const seenPaths = new Set();
  for (const [relativePath, nodeId, ownedPath] of REQUIRED) {
    if (seenPaths.has(relativePath)) fail(`duplicate CATSCAN path ${relativePath}`);
    seenPaths.add(relativePath);
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) fail(`missing ${relativePath}`);
    const { fields, body } = parseFrontMatter(fs.readFileSync(absolutePath, 'utf8'), relativePath);
    if (fields.catscan !== '1') fail(`${relativePath} must declare catscan: 1`);
    if (fields.path !== ownedPath) fail(`${relativePath} declares path ${fields.path}, expected ${ownedPath}`);
    if (fields.owner !== 'simulatte') fail(`${relativePath} must be owned by simulatte`);
    if (fields.contractNode !== nodeId) fail(`${relativePath} declares ${fields.contractNode}, expected ${nodeId}`);
    if (!nodes.has(nodeId)) fail(`${relativePath} references unknown contract node ${nodeId}`);
    for (const section of SECTIONS) {
      if (!body.includes(`## ${section}`)) fail(`${relativePath} is missing ## ${section}`);
    }
  }
  console.log(`CATSCAN valid: ${REQUIRED.length} architecture summaries bound to ${CONTRACT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
