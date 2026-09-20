const test = require('node:test');
const assert = require('node:assert/strict');
const { statusFor } = require('../public/blank/app/create-experience.js');

test('a visible earlier scene does not conceal a failed or unverified replacement', () => {
  for (const state of ['failed', 'error', 'unsupported']) {
    const result = statusFor({ state, visible: true, prompt: 'new scene', message: 'Required model unavailable' });
    assert.equal(result.state, 'error');
    assert.equal(result.message, 'Required model unavailable');
  }
  assert.equal(statusFor({ state: 'not-proven', visible: true, prompt: '', message: 'Missing required object' }).state, 'warning');
});
test('rendering and completed validation are different claims', () => {
  const result = statusFor({ state: 'ready', visible: true, prompt: 'a red ball' });
  assert.equal(result.title, 'Simulation loaded');
  assert.doesNotMatch(result.title, /verified|proven|correct/i);
  assert.equal(statusFor({ state: 'active', visible: true, prompt: 'a red ball' }).title, 'Checking the result');
  assert.equal(statusFor({ state: 'active', visible: false, prompt: 'a red ball' }).title, 'Building your simulation');
});
test('the empty and edited states explain the next available action', () => {
  assert.equal(statusFor({ state: 'ready', visible: false, prompt: '  ' }).message, 'Choose an idea or write your own.');
  assert.equal(statusFor({ state: 'ready', visible: false, prompt: 'a blue cube' }).message, 'Run your description to see the result.');
});
