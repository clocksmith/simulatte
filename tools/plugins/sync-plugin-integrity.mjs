#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PLUGINS = path.join(ROOT, 'public/shared/plugins');
const write = process.argv.includes('--write');
const failures = [];

for (const directoryName of fs.readdirSync(PLUGINS).sort()) {
  const directory = path.join(PLUGINS, directoryName);
  const manifestPath = path.join(directory, 'plugin.json');
  if (!fs.statSync(directory).isDirectory() || !fs.existsSync(manifestPath)) continue;
  const originalText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(originalText);
  const next = {
    ...manifest,
    entry: {
      ...manifest.entry,
      integrity: sha384(resolveOwned(directory, manifest.entry.path)),
    },
    datasets: (manifest.datasets || []).map((declaration) => (
      declaration.reference
        ? {
          ...declaration,
          reference: {
            ...declaration.reference,
            sha256: sha256(resolveOwned(directory, declaration.reference.path)),
          },
        }
        : declaration
    )),
    resources: (manifest.resources || []).map((resource) => ({
      ...resource,
      integrity: sha384(resolveOwned(directory, resource.path)),
    })),
  };
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  if (nextText === originalText) continue;
  if (write) fs.writeFileSync(manifestPath, nextText);
  else failures.push(path.relative(ROOT, manifestPath));
}

if (failures.length) {
  failures.forEach((file) => process.stderr.write(`PLUGIN-INTEGRITY stale ${file}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(`PLUGIN-INTEGRITY ${write ? 'synchronized' : 'verified'}\n`);
}

function resolveOwned(directory, reference) {
  const file = path.resolve(directory, reference);
  if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Plugin manifest reference is not an owned file: ${reference}`);
  }
  return file;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sha384(file) {
  return `sha384-${crypto.createHash('sha384').update(fs.readFileSync(file)).digest('hex')}`;
}
