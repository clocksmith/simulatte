const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const contractPath = path.join(root, 'docs/simulatte/folder-contract.json');
const schemaPath = path.join(root, 'docs/simulatte/folder-contract.schema.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const claimInventory = JSON.parse(fs.readFileSync(
  path.join(root, 'public/data/application-profiles/profile-claim-inventory-v1.json'),
  'utf8',
));

let checker;
test.before(async () => {
  checker = await import(pathToFileURL(path.join(root, 'tools/check-folder-contracts.mjs')));
});

test('folder contract covers every tracked or non-ignored source directory', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  checker.validateShape(contract, schema);
  const inventory = checker.trackedInventory(root);
  const coverage = checker.validateCoverage(contract, inventory);
  assert.equal(coverage.uncoveredDirectories.length, 0);
  assert.equal(coverage.trackedDirectories, coverage.coveredDirectories + coverage.classifiedDirectories);
  assert.equal(contract.coverage.trackedFiles, inventory.files.length);
});

test('isolated validation skips only unavailable external repositories', () => {
  const unavailableCatalog = path.join(os.tmpdir(), 'simulatte-missing-folder-contract-catalog');
  assert.doesNotThrow(() => checker.validateSourceReferences(contract, {
    repositoryRoot: root,
    catalogRoot: unavailableCatalog,
    allowUnavailableExternalSources: true,
  }));
  assert.throws(() => checker.validateSourceReferences(contract, {
    repositoryRoot: root,
    catalogRoot: unavailableCatalog,
    allowUnavailableExternalSources: false,
  }), (error) => error.code === 'folder_contract_source_ref_missing');
  const missingLocal = structuredClone(contract);
  missingLocal.sourceRefs.find((reference) => reference.repository === 'simulatte').path = 'missing-local-source';
  assert.throws(() => checker.validateSourceReferences(missingLocal, {
    repositoryRoot: root,
    catalogRoot: unavailableCatalog,
    allowUnavailableExternalSources: true,
  }), (error) => error.code === 'folder_contract_source_ref_missing');
});

test('every connected profile has exactly one complete experience contract', () => {
  const connected = contract.nodes.filter((node) => node.experience?.profileId);
  assert.deepEqual(
    connected.map((node) => node.experience.profileId).sort(),
    [...claimInventory.profileIds].sort(),
  );
  connected.forEach((node) => {
    assert.ok(node.experience.controls.length > 0, node.id);
    assert.ok(node.experience.simulationInputs.length > 0, node.id);
    assert.ok(node.experience.dataProvenance.length > 0, node.id);
    assert.ok(node.experience.browserPixels.length > 0, node.id);
    assert.ok(node.experience.doesNotProve.length > 0, node.id);
    assert.ok(node.experience.refusalStates.length > 0, node.id);
    assert.ok(node.experience.requiredTests.length > 0, node.id);
    assert.ok(node.experience.requiredBrowserJourneys.length > 0, node.id);
    const joinedUrl = node.experience.urlParameters.join(' ');
    ['world', 'experience', 'profile', 'camera', 'scenario', 'seed', 'param.'].forEach((token) => {
      assert.match(joinedUrl, new RegExp(token.replace('.', '\\.')), `${node.id} ${token}`);
    });
  });
  const safety = contract.nodes.find((node) => node.id === 'simulatte.experience.safety-explorer');
  const exoplanet = contract.nodes.find((node) => node.id === 'simulatte.exoplanet-proposal');
  assert.equal(safety.experience.profileId, null);
  assert.equal(safety.status, 'partial');
  assert.equal(exoplanet.experience.profileId, null);
  assert.equal(exoplanet.status, 'proposed');
});

test('narrowest mapping assigns profile, data, tool, docs, source, and test paths to their experience', () => {
  const cases = [
    ['public/shared/plugins/neighborhood-bulk-pool/pool-solver.js', 'simulatte.experience.neighborhood-bulk-pool'],
    ['public/data/neighborhood-bulk-pool/warehouse-registry-v1.json', 'simulatte.experience.neighborhood-bulk-pool'],
    ['public/data/application-profiles/grid-resilience-us-v1.json', 'simulatte.experience.grid-resilience-us'],
    ['tools/orbital-transfer/build-synthetic-orbital-fixture.mjs', 'simulatte.experience.orbital-transfer-planner'],
    ['docs/simulatte/experiences/maritime-trade.md', 'simulatte.experience.maritime-trade-global'],
    ['tests/sun-walker-visual-storytelling.test.cjs', 'simulatte.experience.sun-walker'],
  ];
  cases.forEach(([filePath, expected]) => assert.equal(checker.narrowestNode(contract, filePath).id, expected));
});

test('shared-core changes select dependent experiences and representative journeys', () => {
  const impact = checker.impactClosure(contract, ['public/shared/core/simulation/plugin-v4-builder.js']);
  claimInventory.profileIds.forEach((profileId) => {
    const profile = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles', `${profileId}.json`), 'utf8'));
    profile.plugins.forEach((plugin) => assert.ok(impact.closureNodeIds.includes(`simulatte.experience.${plugin.id}`), plugin.id));
  });
  ['/city/sun-walker-v1', '/country/grid-resilience-us-v1', '/world/maritime-trade-global-v1', '/solar-system/asteroid-defense-v1', '/star-chart/interstellar-relay-network-v1']
    .forEach((journey) => assert.ok(impact.browserJourneys.includes(journey), journey));
});

test('declared import boundaries accept inherited edges and reject undeclared edges', () => {
  const inventory = checker.trackedInventory(root);
  const edges = checker.validateImports(contract, inventory, root);
  assert.ok(edges.includes('simulatte.app->simulatte.shared'));
  assert.ok(edges.includes('simulatte.platform-bootstrap->simulatte.platform-contracts'));
  const restricted = structuredClone(contract);
  const app = restricted.nodes.find((node) => node.id === 'simulatte.app');
  app.boundary.allowedImportNodeIds = app.boundary.allowedImportNodeIds.filter((id) => id !== 'simulatte.shared');
  assert.throws(() => checker.validateImports(restricted, inventory, root), (error) => error.code === 'folder_contract_import_boundary_violation');
});

test('renderer ownership names every pass and camera composition boundary', () => {
  const app = contract.nodes.find((node) => node.id === 'simulatte.app');
  const ownership = app.ownership.owns.join(' ').toLowerCase();
  ['opaque', 'ground', 'plugin overlays', 'shadows', 'dynamic actors', 'routes', 'labels', 'depth-band', 'camera', 'minimap']
    .forEach((term) => assert.match(ownership, new RegExp(term), term));
  assert.ok(app.intent.mustNotClaim.some((claim) => /screenshot.*not architecture authority/i.test(claim)));
});

test('judge receipt binds deterministic validation, prompt, policy, commit, contract, and inspected hashes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-folder-contract-test-'));
  try {
    const validationPath = path.join(temp, 'validation.json');
    const judgePath = path.join(temp, 'judge.json');
    execFileSync(process.execPath, [
      path.join(root, 'tools/check-folder-contracts.mjs'),
      '--contract', contractPath,
      '--schema', schemaPath,
      '--repository-root', root,
      '--catalog-root', path.resolve(root, '..', 'ouroboros'),
      '--allow-unavailable-external-sources',
      '--changed', 'tools/run-folder-contract-judge.mjs',
      '--receipt', validationPath,
      '--quiet',
    ], { cwd: root });
    execFileSync(process.execPath, [
      path.join(root, 'tools/run-folder-contract-judge.mjs'),
      '--validation-receipt', validationPath,
      '--out', judgePath,
      '--model', 'test-local-model',
      '--no-freshness',
    ], { cwd: root });
    const receipt = JSON.parse(fs.readFileSync(judgePath, 'utf8'));
    assert.equal(receipt.status, 'pending');
    assert.equal(receipt.bindings.model, 'test-local-model');
    for (const field of ['commit', 'contractSha256', 'policySha256', 'deterministicValidationSha256', 'changedDiffSha256', 'promptSha256']) {
      assert.match(receipt.bindings[field], /^[a-f0-9]{40,64}$/, field);
    }
    assert.ok(receipt.bindings.prompt.includes('deterministic failures'));
    assert.ok(receipt.bindings.inspectedFiles.some((row) => row.path === 'tools/run-folder-contract-judge.mjs'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
