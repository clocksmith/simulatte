const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, "..");
const ENTRY = "public/shared/design/simulatte.css";
const TOKEN_FILE = "public/shared/design/tokens.css";
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const clean = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const imports = text => [...clean(text).matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)].map(match => match[1]);
const PAGE_STYLES = ['public/styles.css', 'public/blank/styles.css', 'public/model-selection.css', 'public/world-tiers.css', 'public/shared/design/workbench.css'];

function assertLiteralPropertyNames(text, file) {
  assert.doesNotMatch(clean(text), /(?:^|[;{])\s*var\([^;{}\n]+\)[^:;{}\n]*:/m,
    file + ': tokens belong in declaration values, not property names');
}
function closure(file, stack = []) {
  assert.ok(!stack.includes(file), 'stylesheet import cycle: ' + [...stack, file].join(' -> '));
  const text = read(file);
  const children = imports(text).flatMap(ref => {
    assert.ok(ref.startsWith('.'), 'local relative stylesheet import required: ' + ref);
    const child = path.normalize(path.join(path.dirname(file), ref));
    assert.ok(!child.startsWith('..'), 'stylesheet escapes repository: ' + child);
    return closure(child, [...stack, file]);
  });
  return [{file, text}, ...children];
}

test('public stylesheet resolves the owned design layers without duplicate loading', () => {
  const files = closure(ENTRY).map(row => row.file);
  assert.equal(new Set(files).size, files.length);
  for (const layer of ["tokens.css","primitives.css","components.css","compositions/consent.css"]) assert.ok(imports(read(ENTRY)).some(ref => ref.endsWith(layer)), layer);
  assert.equal(clean(read(ENTRY)).replace(/@import\s+['"][^'"]+['"]\s*;/g, '').trim(), '', 'entry is composition only');
});

test('literal paint values belong to tokens, not component and page rules', () => {
  const files = closure(ENTRY);
  const tokens = read(TOKEN_FILE);
  const definitions = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  for (const {file, text} of files) {
    if (file === TOKEN_FILE) continue;
    const css = clean(text).replace(/url\([^)]*\)/g, '');
    const values = [...css.matchAll(/(?:^|[;{])\s*[-\w]+\s*:\s*([^;{}]+)/g)].map(match => match[1]).join('\n');
    assert.doesNotMatch(values, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[-.\d]/i, file + ' must consume paint tokens');
    for (const [, name] of css.matchAll(/var\(\s*(--[\w-]*paint-[\w-]+)/g)) assert.ok(definitions.has(name), file + ': missing ' + name);
  }
});

test('page entries use stylesheets instead of inline stylesheet forks', () => {
  for (const file of ["public/index.html","public/blank/index.html"]) assert.doesNotMatch(read(file), /<style(?:\s|>)/i, file);
});

test('paint extraction preserves property names including white-space', () => {
  assert.throws(() => assertLiteralPropertyNames('.label { var(--sim-paint-white)-space: nowrap; }', 'broken fixture'));
  assertLiteralPropertyNames('.label { white-space: nowrap; color: var(--sim-paint-white); }', 'valid fixture');
  for (const entry of [ENTRY, ...PAGE_STYLES]) {
    for (const {file, text} of closure(entry)) assertLiteralPropertyNames(text, file);
  }
  assert.match(read('public/shared/design/components.css'), /\.sim-code\s*\{[^}]*\bwhite-space:\s*pre-wrap;/);
  assert.match(read('public/model-selection.css'), /\.model-selection-panel > summary\s*\{[^}]*\bwhite-space:\s*nowrap;/);
});

test('page compositions consume the shared theme without reviving retired theme forks', () => {
  assert.ok(closure('public/styles.css').some(row => row.file === 'public/shared/design/themes/world.css'));
  const pages = PAGE_STYLES;
  for (const file of pages) {
    assert.doesNotMatch(clean(read(file)), /:root\s*\{/);
  }
  const tokens = read(TOKEN_FILE);
  for (const file of pages) {
    const values = [...clean(read(file)).matchAll(/(?:^|[;{])\s*[-\w]+\s*:\s*([^;{}]+)/g)].map(match => match[1]).join('\n');
    assert.doesNotMatch(values, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[-.\d]/i, file + ' must consume paint tokens');
    for (const [, name] of read(file).matchAll(/var\(\s*(--sim-paint-[\w-]+)/g)) assert.ok(tokens.includes(name + ':'), file + ': ' + name);
  }
  assert.match(read('public/blank/index.html'), /href="\.\.\/shared\/design\/simulatte\.css"/);
  assert.match(read('public/index.html'), /href="\.\/shared\/design\/workbench\.css"/);
});
