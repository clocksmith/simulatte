import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGINS = path.join(ROOT, 'public/shared/plugins');
const OUTPUT = path.join(ROOT, 'public/simulatte/platform/plugin-host/generated-plugin-registry.js');
const INDEX = path.join(ROOT, 'public/index.html');
const write = process.argv.includes('--write');

const pluginIds = fs.readdirSync(PLUGINS, { withFileTypes: true })
  .filter((row) => row.isDirectory() && fs.existsSync(path.join(PLUGINS, row.name, 'plugin.json')))
  .map((row) => row.name)
  .sort();
const rows = pluginIds.map(readPlugin);
const output = renderRegistry(rows);
if (write) fs.writeFileSync(OUTPUT, output);
else if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== output) fail('Generated plugin registry is stale; run npm run plugins:sync');
syncIndexScripts(rows, write);
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
  const resourcePaths = [manifest.configSchema, manifest.defaultConfig, ...walk(directory)
    .filter((file) => file.endsWith('.js') && file !== entryPath)
    .map((file) => `./${path.relative(directory, file).split(path.sep).join('/')}`)]
    .sort();
  const resources = resourcePaths.map((resourcePath) => ({
    path: resourcePath,
    integrity: `sha384-${crypto.createHash('sha384').update(fs.readFileSync(path.resolve(directory, resourcePath))).digest('hex')}`,
  }));
  if (JSON.stringify(sortValue(manifest.resources || [])) !== JSON.stringify(sortValue(resources))) {
    if (!write) fail(`${pluginId} resource identities are stale`);
    manifest.resources = resources;
    fs.writeFileSync(manifestPath, `${JSON.stringify(sortValue(manifest), null, 2)}\n`);
  }
  const configPath = path.resolve(directory, manifest.defaultConfig);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return { manifest, configs: { [config.id]: config } };
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((row) => {
    const target = path.join(directory, row.name);
    return row.isDirectory() ? walk(target) : [target];
  });
}

function renderRegistry(rows) {
  const requires = rows.map((row) => `    '${row.manifest.id}': () => require('../../../shared/plugins/${row.manifest.id}/index.js'),`).join('\n');
  const globals = rows.map((row) => `    '${row.manifest.id}': () => root.${row.manifest.entry.globalFactory},`).join('\n');
  const data = JSON.stringify(rows.map((row) => ({ manifest: sortValue(row.manifest), configs: sortValue(row.configs) })));
  return `(function attachGeneratedPluginRegistry(root, factory) {\n  const getFactories = typeof module === 'object' && module.exports\n    ? {\n${requires}\n      }\n    : {\n${globals}\n      };\n  const api = factory(getFactories);\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  root.SimulatteGeneratedPluginRegistry = api;\n})(typeof globalThis !== 'undefined' ? globalThis : window, function createGeneratedPluginRegistry(getFactories) {\n  const rows = ${data};\n  const byId = new Map(rows.map((row) => [row.manifest.id, {\n    ...row,\n    get factory() { const resolve = getFactories[row.manifest.id]; return typeof resolve === 'function' ? resolve() : resolve; },\n  }]));\n  return Object.freeze({\n    schema: 'simulatte.pluginRegistry.v1',\n    ids: Object.freeze([...byId.keys()].sort()),\n    entry(id) { return byId.get(id) || null; },\n  });\n});\n`;
}

function syncIndexScripts(rows, shouldWrite) {
  const source = fs.readFileSync(INDEX, 'utf8');
  const start = '  <!-- generated-plugin-scripts:start -->';
  const end = '  <!-- generated-plugin-scripts:end -->';
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) fail('public/index.html is missing generated plugin script markers');
  const version = source.match(/<script defer src="[^"]+\?v=([^"]+)"/)?.[1] || 'development';
  const paths = rows.flatMap(({ manifest }) => [
    ...manifest.resources.filter((resource) => resource.path.endsWith('.js')).map((resource) => `./shared/plugins/${manifest.id}/${resource.path.replace(/^\.\//, '')}`),
    `./shared/plugins/${manifest.id}/${manifest.entry.path.replace(/^\.\//, '')}`,
  ]);
  const block = [start, ...paths.map((scriptPath) => `  <script defer src="${scriptPath}?v=${version}" integrity="${subresourceIntegrity(scriptPath)}"></script>`), end].join('\n');
  const expected = `${source.slice(0, startIndex)}${block}${source.slice(endIndex + end.length)}`;
  if (source === expected) return;
  if (!shouldWrite) fail('Generated plugin script inventory is stale; run npm run plugins:sync');
  fs.writeFileSync(INDEX, expected);
}

// Base64 SHA-384 for the <script> integrity attribute (SRI needs base64; the manifest
// stores the same hash in hex). The browser enforces this on load, so verifyEntries no
// longer re-fetches plugin .js and /shared plugin .js can be cached immutably.
function subresourceIntegrity(scriptPath) {
  const filePath = path.join(ROOT, 'public', scriptPath.replace(/^\.\//, ''));
  return `sha384-${crypto.createHash('sha384').update(fs.readFileSync(filePath)).digest('base64')}`;
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
