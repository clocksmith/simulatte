const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DOC_DIRECTORIES = Object.freeze([
  path.join(ROOT, 'docs/simulatte/experiences'),
  path.join(ROOT, 'docs/simulatte/experiences/improvements'),
]);

function experienceDocuments() {
  return DOC_DIRECTORIES.flatMap((directory) => fs.readdirSync(directory)
    .filter((filename) => filename.endsWith('.md'))
    .map((filename) => path.join(directory, filename)));
}

test('experience documents do not use em dashes', () => {
  for (const absolutePath of experienceDocuments()) {
    const markdown = fs.readFileSync(absolutePath, 'utf8');
    assert.equal(markdown.includes('—'), false, `${path.relative(ROOT, absolutePath)}: em dash is forbidden`);
  }
});

test('experience document local links resolve', () => {
  for (const absolutePath of experienceDocuments()) {
    const markdown = fs.readFileSync(absolutePath, 'utf8');
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(absolutePath), target.split('#')[0])),
        `${path.relative(ROOT, absolutePath)}: unresolved link ${target}`,
      );
    }
  }
});
