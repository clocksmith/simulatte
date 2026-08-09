#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogArgument = process.argv.find((argument) => argument.startsWith('--catalog-root='));
const catalogRoot = path.resolve(catalogArgument ? catalogArgument.slice('--catalog-root='.length) : path.join(ROOT, '..', 'ouroboros'));
const write = process.argv.includes('--write');
const copies = [
  ['docs/integration/folder-contracts/schema.json', 'docs/simulatte/folder-contract.schema.json'],
  ['docs/integration/folder-contracts/projects/simulatte.json', 'docs/simulatte/folder-contract.json'],
  ['scripts/check-folder-contracts.mjs', 'tools/check-folder-contracts.mjs'],
];

for (const [sourceRelative, targetRelative] of copies) {
  const sourcePath = path.join(catalogRoot, sourceRelative);
  const targetPath = path.join(ROOT, targetRelative);
  if (!fs.existsSync(sourcePath)) throw new Error(`folder_contract_catalog_source_missing: ${sourcePath}`);
  const expected = fs.readFileSync(sourcePath);
  const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
  if (actual?.equals(expected)) continue;
  if (!write) throw new Error(`folder_contract_mirror_stale: ${targetRelative}; run npm run folder-contracts:update`);
  fs.writeFileSync(targetPath, expected);
  process.stdout.write(`Wrote ${targetRelative}.\n`);
}

process.stdout.write(`Folder-contract mirrors synchronized from ${catalogRoot}.\n`);
