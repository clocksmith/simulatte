const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lifecycleApi = require('../public/simulatte/app/mount-lifecycle.js');
const routerApi = require('../public/simulatte/app/router.js');
const bootApi = require('../public/simulatte/app/world-tiers-boot.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeLink() {
  return {
    hidden: true,
    href: '',
    title: '',
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  };
}

test('experience HUD summary binds the active profile, scenario, and V4 state measures', () => {
  const summary = bootApi.experienceHudSummary({
    profileId: 'grid-resilience-us-v1',
    profileLabel: 'Grid Resilience',
    scenario: { label: 'Heat demand peak' },
    contributions: [{
      controls: { controls: [{ id: 'policy' }] },
      state: {
        status: 'ready',
        measures: [
          { kind: 'progress', value: 0, unit: 'ratio' },
          { kind: 'modeled-unserved-energy', value: 377766.206936, unit: 'MWh' },
          { kind: 'minimum-reserve-margin', value: -0.12, unit: 'ratio' },
        ],
      },
    }],
  });

  assert.equal(summary.experienceId, 'grid-resilience-us-v1');
  assert.equal(summary.title, 'Grid Resilience');
  assert.equal(summary.description, 'Heat demand peak · Ready');
  assert.deepEqual(summary.stats, {
    'Modeled Unserved Energy': '377,766.207 MWh',
    'Minimum Reserve Margin': '-0.12 ratio',
  });
});

test('router paths preserve the governed tier and full experience id', () => {
  assert.deepEqual(routerApi.parsePath('/world/maritime-trade-global-v1'), {
    tier: 'world',
    experience: 'maritime-trade-global-v1',
  });
  assert.equal(routerApi.hrefFor({ tier: 'solar-system', experience: 'orbital-transfer-planner-v1' }), '/solar-system/orbital-transfer-planner-v1');
  assert.deepEqual(routerApi.parsePath('/unknown/profile-v1'), { tier: null, experience: null });
});

test('every registered experience resolves to its canonical GitHub Markdown preview', () => {
  const root = path.resolve(__dirname, '..');
  const claimInventory = JSON.parse(fs.readFileSync(
    path.join(root, 'public/data/application-profiles/profile-claim-inventory-v1.json'),
    'utf8',
  ));
  assert.deepEqual(
    Object.keys(bootApi.EXPERIENCE_DOC_PATHS).sort(),
    [...claimInventory.profileIds].sort(),
  );
  for (const profileId of claimInventory.profileIds) {
    const filename = bootApi.EXPERIENCE_DOC_PATHS[profileId];
    assert.ok(fs.existsSync(path.join(root, 'docs/simulatte/experiences', filename)), profileId);
    assert.equal(
      bootApi.experienceDocUrl(profileId),
      `https://github.com/clocksmith/simulatte/blob/main/docs/simulatte/experiences/${filename}`,
    );
  }
  assert.equal(bootApi.experienceDocUrl('unknown-profile-v1'), null);
});

test('experience documentation link updates and fails closed for unknown profiles', () => {
  const link = fakeLink();
  const url = bootApi.updateExperienceDocLink(link, 'cable-trader-pickup-v1');
  assert.equal(url, bootApi.experienceDocUrl('cable-trader-pickup-v1'));
  assert.equal(link.href, url);
  assert.equal(link.hidden, false);
  assert.equal(link.target, undefined);
  assert.match(link['aria-label'], /Cable Trader documentation on GitHub/);
  bootApi.updateExperienceDocLink(link, null);
  assert.equal(link.hidden, true);
  assert.equal(link.href, undefined);
});

test('mount lifecycle links parent cancellation to listeners and fetches', async () => {
  const parent = new AbortController();
  const target = new EventTarget();
  let calls = 0;
  let fetchSignal = null;
  const lifecycle = lifecycleApi.create(parent.signal, async (_input, options) => {
    fetchSignal = options.signal;
    return { ok: true };
  });
  lifecycle.on(target, 'change', () => { calls += 1; });
  target.dispatchEvent(new Event('change'));
  await lifecycle.fetch('/fixture.json');
  assert.equal(calls, 1);
  assert.equal(fetchSignal, lifecycle.signal);

  parent.abort();
  target.dispatchEvent(new Event('change'));
  assert.equal(calls, 1);
  assert.equal(lifecycle.signal.aborted, true);
  assert.throws(() => lifecycle.throwIfAborted(), (error) => error.name === 'AbortError');
});

test('mount lifecycle settles every disposer without masking failures', async () => {
  const calls = [];
  const reported = [];
  const failure = new Error('renderer destroy failed');
  const failures = await lifecycleApi.disposeAll([
    { resource: 'renderer', dispose: () => { calls.push('renderer'); throw failure; } },
    { resource: 'plugin-runtime', dispose: async () => { calls.push('plugin-runtime'); } },
  ], (row) => reported.push(row));

  assert.deepEqual(calls, ['renderer', 'plugin-runtime']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].resource, 'renderer');
  assert.equal(failures[0].error, failure);
  assert.deepEqual(reported, failures);
});

test('app shell aborts and disposes a superseded boot before mounting the latest route', async () => {
  const pendingBoots = [];
  const canonicalRoutes = [];
  const router = {
    canonicalize(route) { canonicalRoutes.push(route); },
    start() {},
  };
  const landing = {
    classList: { add() {}, remove() {} },
    querySelector() { return null; },
    addEventListener() {},
  };
  const documentationLink = fakeLink();
  const boot = (tier, experience, { signal }) => {
    const gate = deferred();
    const mounted = { tier, experience, signal, gate, disposeCount: 0 };
    pendingBoots.push(mounted);
    return gate.promise.then(() => ({
      tier,
      experience,
      dispose: async () => { mounted.disposeCount += 1; },
    }));
  };
  const shell = bootApi.createAppShell({ router, boot, landing, documentationLink });

  const firstRender = shell.renderRoute({ tier: 'city', experience: 'sun-walker-v1' });
  await Promise.resolve();
  const secondRender = shell.renderRoute({ tier: 'world', experience: 'maritime-trade-global-v1' });
  await Promise.resolve();
  assert.equal(pendingBoots[0].signal.aborted, true);

  pendingBoots[0].gate.resolve();
  await Promise.resolve();
  await Promise.resolve();
  pendingBoots[1].gate.resolve();
  await Promise.all([firstRender, secondRender]);

  assert.equal(pendingBoots[0].disposeCount, 1);
  assert.equal(pendingBoots[1].disposeCount, 0);
  assert.equal(documentationLink.href, bootApi.experienceDocUrl('maritime-trade-global-v1'));
  assert.equal(documentationLink.hidden, false);
  assert.deepEqual(canonicalRoutes, [{
    tier: 'world',
    experience: 'maritime-trade-global-v1',
  }]);
});

test('app shell aborts and releases a terminally failed boot attempt', async () => {
  let failedSignal = null;
  const failure = new Error('default profile failed');
  const shell = bootApi.createAppShell({
    router: { canonicalize() {}, start() {} },
    boot: async (_tier, _experience, { signal }) => {
      failedSignal = signal;
      throw failure;
    },
    landing: {
      classList: { add() {}, remove() {} },
      querySelector() { return null; },
      addEventListener() {},
    },
  });

  await assert.rejects(
    shell.renderRoute({ tier: 'city', experience: null }),
    (error) => error === failure
  );
  assert.equal(failedSignal.aborted, true);
});
