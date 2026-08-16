const assert = require('node:assert/strict');
const test = require('node:test');

const store = require('../public/blank/app/prompt/prompt-review-bridge-store.js');
const bridge = require('../public/blank/app/prompt/prompt-review-bridge.js');

test('review bridge exposes the stable training API through explicit dependencies', () => {
  assert.equal(typeof store.createReviewStore, 'function');
  assert.deepEqual(Object.keys(bridge).sort(), [
    'collectRecord',
    'disable',
    'enable',
    'exportReviews',
    'start',
    'syncQueuedRecords',
    'toggle',
  ]);
});

test('review fallback storage fails explicitly instead of dropping a correction record', async () => {
  const reviewStore = store.createReviewStore({
    indexedDB: null,
    localStorage: {
      getItem: () => '[]',
      setItem: () => { throw new Error('quota exceeded'); },
    },
  });
  await assert.rejects(
    reviewStore.put({ id: 'review:correction:1' }, false),
    /fallback storage failed: quota exceeded/
  );
});
