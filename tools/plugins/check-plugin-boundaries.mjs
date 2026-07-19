import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGINS = path.join(ROOT, 'public/plugins');
const errors = [];
const files = walk(PLUGINS).filter((file) => file.endsWith('.js'));
for (const file of files) {
  const relative = path.relative(ROOT, file);
  const source = fs.readFileSync(file, 'utf8');
  check(relative, source, /\bfetch\s*\(/, 'network fetch');
  check(relative, source, /\b(?:caches|indexedDB|localStorage|sessionStorage)\b/, 'browser storage');
  check(relative, source, /\bdocument\s*\.|\bquerySelector\s*\(|\bgetElementById\s*\(/, 'DOM access');
  check(relative, source, /require\(['"]\.\.\/\.\.\/(?:app|runtime|world|platform)\//, 'host implementation import');
  const pluginId = relative.split(path.sep)[2];
  const crossPlugin = [...source.matchAll(/require\(['"]\.\.\/([^/'"]+)\//g)].map((match) => match[1]).filter((id) => id !== pluginId);
  crossPlugin.forEach((id) => errors.push(`${relative}: cross-plugin import ${id}`));
}
if (errors.length) {
  errors.forEach((error) => console.error(`PLUGIN-BOUNDARY ${error}`));
  process.exit(1);
}
console.log(`PLUGIN-BOUNDARY status=verified files=${files.length}`);

function check(relative, source, pattern, label) {
  if (pattern.test(source)) errors.push(`${relative}: forbidden ${label}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((row) => {
    const target = path.join(directory, row.name);
    return row.isDirectory() ? walk(target) : [target];
  });
}
