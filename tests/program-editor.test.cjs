const test = require('node:test');
const assert = require('node:assert/strict');
const editorUi = require('../public/shared/design/program-editor.js');
const navigation = require('../public/shared/design/product-navigation.js');

test('shared navigation uses local paths only on loopback hosts', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1', 'simulatte.world', 'preview.web.app']) {
    const link = { dataset: { localHref: '../' }, href: 'https://simulatte.world/',
      setAttribute(name, value) { this[name] = value; } };
    navigation.connect({ querySelectorAll: () => [link] }, hostname);
    assert.equal(link.href, hostname.endsWith('.world') || hostname.endsWith('.app')
      ? 'https://simulatte.world/' : '../');
  }
});
test('both editors share explicit clean, dirty, and unapplied draft state', () => {
  const editor = { value: '', dataset: {} };
  const apply = {};
  const status = { dataset: {} };
  const draft = editorUi.createDraft({ editor, apply, status });
  draft.setValue('{"version":1}');
  assert.equal(apply.disabled, true);
  draft.markDirty('Unapplied edit');
  assert.equal(draft.isDirty(), true);
  assert.equal(editor.dataset.dirty, 'true');
  assert.equal(status.dataset.state, 'dirty');
  assert.equal(apply.disabled, false);
  draft.setValue('{"version":2}');
  assert.equal(draft.isDirty(), false);
  assert.equal(editor.value, '{"version":2}');
});
test('JSON exports retain their URL through navigation and release it afterward', async () => {
  const order = [];
  const callbacks = [];
  const documentRoot = {
    defaultView: { Blob, URL: { createObjectURL() { return 'blob:world'; }, revokeObjectURL(url) { order.push(url); } },
      setTimeout(callback) { callbacks.push(callback); } },
    createElement() { return { click() { order.push('download'); } }; },
  };
  await editorUi.downloadJson(documentRoot, 'world.json', '{}');
  assert.deepEqual(order, ['download']);
  callbacks[0]();
  assert.deepEqual(order, ['download', 'blob:world']);
});
