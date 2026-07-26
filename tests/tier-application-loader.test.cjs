const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const loader = require('../public/simulatte/platform/bootstrap/tier-application-loader.js');

const MANIFEST_URL = 'https://fixture.test/data/tier-application-manifest.json';

function profile(id, worldModelId) {
  return {
    schema: 'simulatte.applicationProfile.v3',
    id,
    tier: 'world',
    worldModelId,
    plugins: [],
    routeObjective: {},
    interaction: {
      mode: 'simulation',
      missionRequired: false,
      startLabel: 'Run',
      shuffleLabel: 'Shuffle',
    },
    defaultSeedId: 'baseline',
    seeds: [{
      id: 'baseline',
      label: 'Baseline',
      description: 'Loader fixture',
      seed: `${id}:seed`,
      scenarioId: `${id}:scenario`,
    }],
  };
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function fixture({ mismatch = false } = {}) {
  const documents = new Map();
  const profiles = [
    profile('profile-a', 'world-a'),
    profile('profile-b', mismatch ? 'world-a' : 'world-b'),
  ];
  const worlds = [{ id: 'world-a', nodes: [] }, { id: 'world-b', nodes: [] }];
  profiles.forEach((value) => documents.set(`https://fixture.test/data/${value.id}.json`, JSON.stringify(value)));
  worlds.forEach((value) => documents.set(`https://fixture.test/data/${value.id}.json`, JSON.stringify(value)));
  const manifest = {
    generatedAt: '2026-07-26T00:00:00Z',
    id: 'fixture-tier-applications-v3',
    schema: 'simulatte.tierApplicationManifest.v3',
    tiers: {
      world: {
        defaultProfileId: 'profile-a',
        profiles: profiles.map((value, index) => {
          const world = worlds[index];
          const profileText = documents.get(`https://fixture.test/data/${value.id}.json`);
          const worldText = documents.get(`https://fixture.test/data/${world.id}.json`);
          return {
            id: value.id,
            path: `./${value.id}.json`,
            sha256: sha256(profileText),
            world: {
              id: world.id,
              path: `./${world.id}.json`,
              sha256: sha256(worldText),
            },
          };
        }),
      },
    },
  };
  documents.set(MANIFEST_URL, JSON.stringify(manifest));
  const fetchImpl = async (url) => {
    const text = documents.get(String(url));
    return {
      ok: text !== undefined,
      status: text === undefined ? 404 : 200,
      headers: { get: () => null },
      text: async () => text || '',
    };
  };
  return { manifest, fetchImpl };
}

test('manifest v3 selects each profile before loading its independently pinned world', async () => {
  const lane = fixture();
  const first = await loader.loadTierApplication({
    tier: 'world',
    requestedProfileId: 'profile-a',
    manifestUrl: MANIFEST_URL,
    fetchImpl: lane.fetchImpl,
  });
  const second = await loader.loadTierApplication({
    tier: 'world',
    requestedProfileId: 'profile-b',
    manifestUrl: MANIFEST_URL,
    fetchImpl: lane.fetchImpl,
  });
  assert.equal(first.applicationProfile.worldModelId, 'world-a');
  assert.equal(first.world.id, 'world-a');
  assert.equal(second.applicationProfile.worldModelId, 'world-b');
  assert.equal(second.world.id, 'world-b');
  assert.equal(first.receipt.world.sha256, lane.manifest.tiers.world.profiles[0].world.sha256);
  assert.equal(second.receipt.world.sha256, lane.manifest.tiers.world.profiles[1].world.sha256);
});

test('manifest v3 rejects v2, mixed rows, missing hashes, duplicate profiles, and missing defaults', () => {
  const base = fixture().manifest;
  assert.throws(
    () => loader.validateTierManifest({ ...base, schema: 'simulatte.tierApplicationManifest.v2' }),
    (error) => error.code === 'tier_manifest_invalid'
  );
  assert.throws(
    () => loader.validateTierManifest({
      ...base,
      tiers: { world: { ...base.tiers.world, world: base.tiers.world.profiles[0].world } },
    }),
    (error) => error.code === 'tier_manifest_mixed_version'
  );
  assert.throws(
    () => loader.validateTierManifest({
      ...base,
      tiers: {
        world: {
          ...base.tiers.world,
          profiles: [{ ...base.tiers.world.profiles[0], sha256: undefined }],
        },
      },
    }),
    (error) => error.code === 'tier_reference_invalid'
  );
  assert.throws(
    () => loader.validateTierManifest({
      ...base,
      tiers: {
        world: {
          ...base.tiers.world,
          profiles: [base.tiers.world.profiles[0], base.tiers.world.profiles[0]],
        },
      },
    }),
    (error) => error.code === 'tier_profile_duplicate'
  );
  assert.throws(
    () => loader.validateTierManifest({
      ...base,
      tiers: { world: { ...base.tiers.world, defaultProfileId: 'missing' } },
    }),
    (error) => error.code === 'tier_default_profile_missing'
  );
});

test('manifest v3 fails closed when a loaded profile selects a different world identity', async () => {
  const lane = fixture({ mismatch: true });
  await assert.rejects(
    loader.loadTierApplication({
      tier: 'world',
      requestedProfileId: 'profile-b',
      manifestUrl: MANIFEST_URL,
      fetchImpl: lane.fetchImpl,
    }),
    (error) => error.code === 'tier_world_identity_mismatch'
  );
});
