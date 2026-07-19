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
