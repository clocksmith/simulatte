#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const warningLines = 750;
const maximumLines = 999;

function javascriptFiles(directory) {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...javascriptFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) rows.push(absolute);
  }
  return rows;
}

const oversized = [];
const warnings = [];
for (const file of javascriptFiles(publicRoot)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
  const row = { file: path.relative(root, file), lines };
  if (lines > maximumLines) oversized.push(row);
  else if (lines > warningLines) warnings.push(row);
}

for (const row of warnings.sort((a, b) => b.lines - a.lines)) {
  process.stderr.write(`SOURCE-SIZE warning ${row.lines} ${row.file}\n`);
}
if (oversized.length) {
  for (const row of oversized.sort((a, b) => b.lines - a.lines)) {
    process.stderr.write(`SOURCE-SIZE error ${row.lines} ${row.file}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`SOURCE-SIZE pass warnings=${warnings.length} maximum=${maximumLines}\n`);
}
