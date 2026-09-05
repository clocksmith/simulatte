#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function commandInventory(scripts) {
  const resolve = (name, seen = []) => {
    if (!Object.hasOwn(scripts, name)) throw new Error(`Unknown command alias: ${name}`);
    if (seen.includes(name)) throw new Error(`Command alias cycle: ${[...seen, name].join(' -> ')}`);
    const match = /^npm run ([\w:-]+)(?: --)?$/.exec(scripts[name]);
    return match ? resolve(match[1], [...seen, name]) : name;
  };
  return Object.keys(scripts).sort().map((name) => ({
    name, group: name.split(':')[0], command: scripts[name], canonical: resolve(name),
  }));
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');
  if (args.some((arg) => arg.startsWith('-')) || args.length > 1) {
    throw new Error('usage: npm run help -- [search] [--json]');
  }
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const rows = commandInventory(scripts).filter((row) => !args[0] || `${row.name} ${row.command}`.includes(args[0]));
  if (json) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log('Start here: serve | check:fast | test | audit:workbench | check:release');
  console.log('Read-only command directory from package.json. Nothing below is executed.');
  let group = null;
  for (const row of rows) {
    if (row.group !== group) { group = row.group; console.log(`\n${group}`); }
    console.log(`  ${row.name}${row.canonical === row.name ? '' : ` (alias of ${row.canonical})`}\n    ${row.command}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
