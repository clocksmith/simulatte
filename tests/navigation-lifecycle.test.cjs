const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lifecycleApi = require('../public/simulatte/app/mount-lifecycle.js');
const routerApi = require('../public/simulatte/app/router.js');
const bootApi = require('../public/simulatte/app/world-tiers-boot.js');
const mainView = require('../public/simulatte/app/main-view.js');
const pluginContracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');

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
  const profile = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../public/data/application-profiles/grid-resilience-us-v1.json'),
    'utf8',
  ));
  const summary = bootApi.experienceHudSummary({
    profileId: 'grid-resilience-us-v1',
    profile,
    profileLabel: 'Grid Resilience',
    scenario: { label: 'Heat demand peak' },
    contributions: [{
      pluginId: 'grid-resilience-us',
      controls: { controls: [{ id: 'policy' }] },
      events: [{
        id: 'grid:event:12',
        kind: 'grid.interface-saturated',
      }],
      state: {
        status: 'ready',
        eventIds: ['grid:event:12'],
        measures: [
          { kind: 'progress', value: 0.5, unit: 'ratio' },
          { kind: 'modeled-unserved-load', value: 377766.206936, unit: 'MW' },
          { kind: 'current-minimum-reserve-margin', value: -0.12, unit: 'ratio' },
        ],
      },
    }],
    runState: 'running',
    playback: { currentStep: 12, totalSteps: 24 },
  });

  assert.equal(summary.experienceId, 'grid-resilience-us-v1');
  assert.equal(summary.title, 'Grid Resilience');
  assert.equal(summary.description, 'Heat demand peak');
  assert.equal(summary.state, 'Running');
  assert.equal(summary.event, 'Interface Saturated');
  assert.equal(summary.stageLabel, 'Policy responds');
  assert.match(summary.narrative, /Dispatch, storage/);
  assert.equal(summary.comparison, 'Comparison settles after both branches complete');
  assert.deepEqual(summary.stats, {
    'Modeled Unserved Load': '377,766.207 MW',
    'Current Minimum Reserve Margin': '-12%',
  });
});

test('all shipped experiences declare validated story, metric, comparison, and view behavior', () => {
  const root = path.resolve(__dirname, '..');
  const inventory = JSON.parse(fs.readFileSync(
    path.join(root, 'public/data/application-profiles/profile-claim-inventory-v1.json'),
    'utf8',
  ));
  const kinds = new Map();
  inventory.profileIds.forEach((profileId) => {
    const profile = JSON.parse(fs.readFileSync(
      path.join(root, 'public/data/application-profiles', `${profileId}.json`),
      'utf8',
    ));
    pluginContracts.validateProfile(profile);
    assert.ok(profile.experience);
    assert.ok(profile.experience.primaryMeasureKinds.length <= 5);
    assert.equal(profile.experience.stages[0].fromProgress, 0);
    assert.ok(profile.experience.supportedViews.includes(profile.experience.defaultView));
    kinds.set(profileId, profile.experience.kind);
  });
  assert.equal(kinds.get('safety-explorer-v1'), 'analysis');
  assert.equal(kinds.get('orbital-transfer-planner-v1'), 'solver');
  assert.equal([...kinds.values()].filter((kind) => kind === 'simulation').length, 9);
});

test('the shared shell exposes POV and first-class playback controls', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /id="camera-pov"/);
  assert.match(html, /id="camera-free"/);
  assert.match(html, /id="camera-compare"/);
  assert.match(html, /id="semantic-label-canvas"/);
  assert.match(html, /id="playback-strip"/);
  assert.match(html, /id="playback-event"/);
  const strip = html.slice(html.indexOf('id="playback-strip"'), html.indexOf('id="mission-error"'));
  assert.match(strip, /id="step-button"/);
  assert.match(strip, /id="reset-button"/);
  assert.match(strip, /id="playback-timeline"/);
  assert.match(strip, /id="playback-speed"/);
  assert.doesNotMatch(
    fs.readFileSync(path.resolve(__dirname, '../public/simulatte/app/main.js'), 'utf8'),
    /\bmainView\./,
  );
});

test('side metrics replace the previous experience rows instead of retaining stale values', () => {
  const node = () => ({
    children: [],
    dataset: {},
    hidden: false,
    textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  });
  const documentRef = { createElement: node };
  const elements = {
    experienceSummary: { ...node(), ownerDocument: documentRef },
    experienceSummaryState: node(),
    experienceSummaryTitle: node(),
    experienceSummaryDescription: node(),
    experienceSummaryEvent: node(),
    experienceSummaryNarrative: node(),
    experienceSummaryStats: node(),
    experienceSummaryComparison: node(),
    playbackStrip: { hidden: true },
    playbackEvent: node(),
  };
  mainView.renderExperienceSummary(elements, {
    experienceId: 'grid-resilience-us-v1',
    state: 'Running',
    title: 'Grid Resilience',
    description: 'Heat peak',
    event: 'Outage',
    narrative: 'Grid state changes.',
    stats: { 'Unserved Load': '12 MW', Reserves: '4%' },
    comparison: 'Baseline running',
  });
  mainView.renderExperienceSummary(elements, {
    experienceId: 'asteroid-defense-v1',
    state: 'Ready',
    title: 'Asteroid Defense',
    description: 'Short arc',
    event: 'Observing',
    narrative: 'Follow-up observations reduce uncertainty.',
    stats: { 'Encounter Distance': '42,000 km' },
    comparison: '',
  });
  assert.equal(elements.experienceSummary.dataset.experienceId, 'asteroid-defense-v1');
  assert.equal(elements.experienceSummaryTitle.textContent, 'Asteroid Defense');
  assert.equal(elements.experienceSummaryStats.children.length, 1);
  assert.equal(elements.experienceSummaryStats.children[0].children[0].textContent, 'Encounter Distance');
  assert.equal(elements.experienceSummaryStats.children[0].children[1].textContent, '42,000 km');
  assert.equal(elements.experienceSummaryComparison.hidden, true);
});

test('tier camera controls resolve real overview, follow, POV, and compare targets by priority', () => {
  const targets = [
    { id: 'overview-low', viewMode: 'overview', priority: 10 },
    { id: 'overview-high', viewMode: 'overview', priority: 90 },
    { id: 'follow', viewMode: 'follow', priority: 60 },
    { id: 'compare', viewMode: 'compare', priority: 70 },
  ];
  assert.equal(bootApi.preferredTierCameraTarget(targets, 'overview').id, 'overview-high');
  assert.equal(bootApi.preferredTierCameraTarget(targets, 'follow').id, 'follow');
  assert.equal(bootApi.preferredTierCameraTarget(targets, 'pov').id, 'follow');
  assert.equal(bootApi.preferredTierCameraTarget(targets, 'compare').id, 'compare');
  assert.equal(bootApi.preferredTierCameraTarget(targets, 'free'), null);
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

test('experience actions use one honest verb taxonomy', () => {
  const root = path.resolve(__dirname, '..');
  const expected = {
    'cable-trader-pickup-v1': 'Run exchange',
    'neighborhood-bulk-pool-v1': 'Run pooling experiment',
    'safety-explorer-v1': 'Analyze corridor',
    'sun-walker-v1': 'Run shaded walk',
    'food-recall-us-v1': 'Run recall experiment',
    'grid-resilience-us-v1': 'Run resilience experiment',
    'maritime-trade-global-v1': 'Run voyage',
    'subsea-network-global-v1': 'Run network experiment',
    'orbital-transfer-planner-v1': 'Solve transfer',
    'asteroid-defense-v1': 'Run defense experiment',
    'interstellar-relay-network-v1': 'Run relay experiment',
  };
  Object.entries(expected).forEach(([profileId, startLabel]) => {
    const profile = JSON.parse(fs.readFileSync(
      path.join(root, 'public/data/application-profiles', `${profileId}.json`),
      'utf8',
    ));
    assert.equal(profile.interaction.startLabel, startLabel, profileId);
    assert.equal(profile.interaction.shuffleLabel, 'Change scenario', profileId);
  });
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

test('app shell clears stale side metrics before a different experience boots', async () => {
  const previousDocument = global.document;
  const summary = { hidden: false, dataset: { experienceId: 'old-experience-v1' } };
  const stats = {
    children: [{ textContent: 'Old metric' }],
    replaceChildren() { this.children = []; },
  };
  global.document = {
    body: { classList: { add() {}, remove() {} }, dataset: {} },
    getElementById(id) {
      if (id === 'experience-summary') return summary;
      if (id === 'experience-summary-stats') return stats;
      return null;
    },
    querySelectorAll() { return []; },
  };
  try {
    const shell = bootApi.createAppShell({
      router: { canonicalize() {}, start() {} },
      landing: {
        classList: { add() {}, remove() {} },
        querySelector() { return null; },
        addEventListener() {},
      },
      boot: async (tier, experience) => ({ tier, experience, dispose() {} }),
    });
    await shell.renderRoute({ tier: 'world', experience: 'maritime-trade-global-v1' });
    assert.equal(summary.hidden, true);
    assert.equal(summary.dataset.experienceId, undefined);
    assert.deepEqual(stats.children, []);
  } finally {
    global.document = previousDocument;
  }
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
