import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'public/shared/blank-core');
const banner = '// Generated from Blank core factories. Edit the library, not this compatibility build.\n';
const relativeModule = (from, to) => {
  const relative = path.relative(path.dirname(from), to).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : './' + relative;
};

export function syncBlankCoreCompatibility({ write = false } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(packageRoot, 'compatibility.json'), 'utf8'));
  if (config.schema !== 'simulatte.blankCoreCompatibility.v1') throw new Error('Unknown Blank core compatibility contract');
  const byId = new Map(config.entries.map(entry => [entry.id, entry]));
  function emit(destination, content) {
    if (write) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    } else if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content) {
      throw new Error('Stale Blank core projection: ' + path.relative(root, destination));
    }
  }
  for (const entry of config.entries) {
    const canonical = fs.readFileSync(path.join(packageRoot, 'factories', entry.id + '.js'), 'utf8');
    const declaration = 'export default function ' + entry.factoryName + '(';
    if (!canonical.startsWith(declaration)) throw new Error('Expected one canonical factory: ' + entry.id);
    const factory = canonical.slice('export default '.length).trimEnd();
    const packageFile = path.join(packageRoot, 'compat', entry.id + '.js');
    const browserDependencies = entry.dependencies.map(id => {
      const dependency = byId.get(id);
      if (!dependency) throw new Error('Undeclared compatibility dependency: ' + id);
      return 'root.' + dependency.global;
    });
    const commonDependencies = entry.dependencies.map(id => "require('./" + id + ".js')");
    const loader = "() => import('../index.js')";
    const argumentsFor = (dependencies, load) => [...dependencies, ...(entry.loader ? [load] : [])].join(', ');
    const invocation = argumentsFor(commonDependencies.map((value, index) =>
      '(' + 'common ? ' + value + ' : ' + browserDependencies[index] + ')'), loader);
    emit(packageFile, banner + '(function attach(root, factory) {\n'
      + "  const common = typeof module === 'object' && module.exports;\n"
      + '  const api = factory(' + invocation + ');\n'
      + '  if (common) module.exports = api;\n'
      + '  else root.' + entry.global + ' = api;\n'
      + "})(typeof globalThis !== 'undefined' ? globalThis : window, " + factory + ');\n');
    if (entry.legacy) {
      const destination = path.join(root, entry.legacy);
      const packageImport = relativeModule(destination, packageFile);
      const browserLoader = '() => import(' + JSON.stringify(relativeModule(destination, path.join(packageRoot, 'index.js'))) + ')';
      emit(destination, banner + '(function attach(root, factory) {\n'
        + "  if (typeof module === 'object' && module.exports) {\n"
        + '    module.exports = require(' + JSON.stringify(packageImport) + ');\n'
        + '    root.' + entry.global + ' = module.exports;\n'
        + '    return;\n  }\n'
        + '  root.' + entry.global + ' = factory(' + argumentsFor(browserDependencies, browserLoader) + ');\n'
        + "})(typeof globalThis !== 'undefined' ? globalThis : window, " + factory + ');\n');
    }
  }
  emit(path.join(packageRoot, 'compat/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
  emit(path.join(packageRoot, 'schemas/world-spec.schema.json'),
    fs.readFileSync(path.join(root, 'public/shared/contracts/world-spec.schema.json'), 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  syncBlankCoreCompatibility({ write });
  process.stdout.write(write ? 'Generated Blank core compatibility assets.\n' : 'Blank core compatibility assets are synchronized.\n');
}
