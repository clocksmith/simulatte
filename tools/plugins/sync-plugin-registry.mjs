import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGINS = path.join(ROOT, 'public/plugins');
const OUTPUT = path.join(ROOT, 'public/platform/plugin-host/generated-plugin-registry.js');
const write = process.argv.includes('--write');

const pluginIds = fs.readdirSync(PLUGINS, { withFileTypes: true })
  .filter((row) => row.isDirectory() && fs.existsSync(path.join(PLUGINS, row.name, 'plugin.json')))
  .map((row) => row.name)
  .sort();
const rows = pluginIds.map(readPlugin);
const output = renderRegistry(rows);
if (write) fs.writeFileSync(OUTPUT, output);
else if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== output) fail('Generated plugin registry is stale; run npm run plugins:sync');
console.log(`PLUGIN-REGISTRY status=${write ? 'written' : 'verified'} plugins=${rows.length} ids=${pluginIds.join(',')}`);

function readPlugin(pluginId) {
  const directory = path.join(PLUGINS, pluginId);
  const manifestPath = path.join(directory, 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.id !== pluginId) fail(`${manifestPath} ID ${manifest.id} must match directory ${pluginId}`);
  const entryPath = path.resolve(directory, manifest.entry.path);
  if (!entryPath.startsWith(`${directory}${path.sep}`)) fail(`${pluginId} entry escapes its plugin directory`);
  const integrity = `sha384-${crypto.createHash('sha384').update(fs.readFileSync(entryPath)).digest('hex')}`;
  if (manifest.entry.integrity !== integrity) {
    if (!write) fail(`${pluginId} entry integrity expected ${integrity}, received ${manifest.entry.integrity}`);
    manifest.entry.integrity = integrity;
    fs.writeFileSync(manifestPath, `${JSON.stringify(sortValue(manifest), null, 2)}\n`);
  }
  const configPath = path.resolve(directory, manifest.defaultConfig);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return { manifest, configs: { [config.id]: config } };
}

function renderRegistry(rows) {
  const requires = rows.map((row) => `    '${row.manifest.id}': require('../../../plugins/${row.manifest.id}/index.js'),`).join('\n');
  const globals = rows.map((row) => `    '${row.manifest.id}': root.${row.manifest.entry.globalFactory},`).join('\n');
  const data = JSON.stringify(rows.map((row) => ({ manifest: sortValue(row.manifest), configs: sortValue(row.configs) })), null, 2);
  return `(function attachGeneratedPluginRegistry(root, factory) {\n  const factories = typeof module === 'object' && module.exports\n    ? {\n${requires}\n      }\n    : {\n${globals}\n      };\n  const api = factory(factories);\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  root.SimulatteGeneratedPluginRegistry = api;\n})(typeof globalThis !== 'undefined' ? globalThis : window, function createGeneratedPluginRegistry(factories) {\n  const rows = ${data};\n  const byId = new Map(rows.map((row) => [row.manifest.id, Object.freeze({ ...row, factory: factories[row.manifest.id] })]));\n  return Object.freeze({\n    schema: 'simulatte.pluginRegistry.v1',\n    ids: Object.freeze([...byId.keys()].sort()),\n    entry(id) { return byId.get(id) || null; },\n  });\n});\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function fail(message) {
  console.error(`PLUGIN-REGISTRY status=failed reason=${message}`);
  process.exit(1);
}
