#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST_PATH = path.join(PUBLIC, 'data/autonomy/autonomy-manifest.json');
const require = createRequire(import.meta.url);
const contracts = require('../../public/autonomy/contracts/contract-validator.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function resolveReference(manifest, key) {
  const reference = manifest[key];
  const file = path.resolve(path.dirname(MANIFEST_PATH), reference.path);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Autonomy manifest ${key} path leaves public/: ${reference.path}`);
  }
  if (!fs.existsSync(file)) throw new Error(`Autonomy manifest ${key} path does not exist: ${reference.path}`);
  const hash = hashFile(file);
  if (hash !== reference.sha256) {
    throw new Error(`Autonomy manifest ${key} SHA-256 expected ${reference.sha256}, received ${hash}`);
  }
  const value = readJson(file);
  if (value.id !== reference.id) throw new Error(`Autonomy manifest ${key} ID expected ${reference.id}, received ${value.id || 'missing'}`);
  return value;
}

function publicAutonomyJavaScript() {
  const root = path.join(PUBLIC, 'autonomy');
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(file);
  });
  walk(root);
  return files.sort();
}

function validateHtmlScripts() {
  const htmlPath = path.join(PUBLIC, 'autonomy/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g)).map((match) => match[1]);
  if (!scripts.length) throw new Error('Autonomy HTML expected deferred runtime scripts');
  scripts.forEach((source) => {
    const file = path.resolve(path.dirname(htmlPath), source);
    if (!fs.existsSync(file)) throw new Error(`Autonomy HTML script does not exist: ${source}`);
  });
  if (!html.includes('id="autonomy-canvas"')) throw new Error('Autonomy HTML expected autonomy-canvas');
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  contracts.validateManifest(manifest);
  const featureCatalog = resolveReference(manifest, 'featureCatalog');
  const world = resolveReference(manifest, 'world');
  const embodiment = resolveReference(manifest, 'embodiment');
  const policy = resolveReference(manifest, 'policy');
  contracts.validateFeatureCatalog(featureCatalog);
  contracts.validateWorld(world, featureCatalog);
  contracts.validateEmbodiment(embodiment);
  contracts.validatePolicy(policy);
  publicAutonomyJavaScript().forEach((file) => {
    const lineCount = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    if (lineCount > 999) throw new Error(`${path.relative(ROOT, file)} has ${lineCount} lines; maximum is 999`);
  });
  validateHtmlScripts();
  console.log(`AUTONOMY-DATA manifest=${manifest.id} world=${world.id} embodiment=${embodiment.id} policy=${policy.id} status=verified`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
