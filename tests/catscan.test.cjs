const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function charter({ component, parent, target = 'Produce a bounded result.' }) {
  return `# CATSCAN: ${component}\n\nComponent: \`${component}\`\nParent: ${parent}\nTarget: ${target}\n\n## Authority\n\n- Owns bounded decisions.\n- Does not own adjacent decisions.\n\n## Scope\n\n- Applies to this component.\n\n## Inputs\n\n- [Input](contract.md).\n\n## Outputs\n\n- [Output](contract.md).\n\n## Invariants\n\n- Failures remain explicit.\n\n## Acceptance\n\n- The component remains bounded.\n- Evidence: [contract fixture](contract.md).\n\n## Non-goals\n\n- Adjacent product behavior.\n\n## Freedom\n\nAny mechanism is permitted if it preserves these boundaries and passes the acceptance evidence.\n`;
}

async function withFixture(runFixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-catscan-'));
  fs.writeFileSync(path.join(root, 'contract.md'), '# Contract\n');
  fs.writeFileSync(path.join(root, 'CATSCAN.md'), charter({ component: 'root', parent: 'none' }));
  fs.mkdirSync(path.join(root, 'child', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'child', 'contract.md'), '# Child contract\n');
  fs.writeFileSync(path.join(root, 'child', 'CATSCAN.md'), charter({
    component: 'root.child',
    parent: '[root](../CATSCAN.md)',
  }));
  try {
    await runFixture(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('recursive CATSCAN validation accepts unique components and nearest parents', async () => {
  const { validateCatscans } = await import('../tools/check-catscan.mjs');
  await withFixture((root) => {
    const charters = validateCatscans(root);
    assert.deepEqual(charters.map((row) => row.component), ['root', 'root.child']);
  });
});

test('recursive CATSCAN validation rejects a skipped nearest parent', async () => {
  const { validateCatscans } = await import('../tools/check-catscan.mjs');
  await withFixture((root) => {
    fs.writeFileSync(path.join(root, 'child', 'nested', 'contract.md'), '# Nested contract\n');
    fs.writeFileSync(path.join(root, 'child', 'nested', 'CATSCAN.md'), charter({
      component: 'root.child.nested',
      parent: '[root](../../CATSCAN.md)',
    }));
    assert.throws(() => validateCatscans(root), /nearest parent is child\/CATSCAN\.md/);
  });
});

test('recursive CATSCAN validation rejects missing evidence links', async () => {
  const { validateCatscans } = await import('../tools/check-catscan.mjs');
  await withFixture((root) => {
    const childPath = path.join(root, 'child', 'CATSCAN.md');
    fs.writeFileSync(childPath, fs.readFileSync(childPath, 'utf8').replaceAll('contract.md', 'missing.md'));
    assert.throws(() => validateCatscans(root), /link does not exist/);
  });
});

test('generated component index is deterministic and rejects drift', async () => {
  const { renderComponentIndex, validateCatscans, validateIndex } = await import('../tools/check-catscan.mjs');
  await withFixture((root) => {
    const expected = renderComponentIndex(validateCatscans(root));
    const indexPath = path.join(root, 'component-index.md');
    fs.writeFileSync(indexPath, expected);
    assert.doesNotThrow(() => validateIndex(root, 'component-index.md', expected));
    fs.appendFileSync(indexPath, 'drift\n');
    assert.throws(() => validateIndex(root, 'component-index.md', expected), /is stale/);
  });
});
