'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/simulatte/system-diagram/private-crypto.js');
const fixture = {schema:'simulatte.privatePracticeCollection.v1',title:'Private fixture',notesMarkdown:'Secret notes: <script>never execute</script>',exercises:[{id:'practice',diagram:{nodes:[]}}]};
const password = 'only-a-synthetic-test-password';

test('password encryption round trips, uses fresh salts/IVs, and exposes no plaintext metadata', async () => {
  const a = await C.encrypt(fixture,password), b = await C.encrypt(fixture,password);
  assert.notEqual(a.kdf.salt,b.kdf.salt); assert.notEqual(a.iv,b.iv);
  assert.equal(JSON.stringify(a).includes(fixture.title),false);
  assert.equal(JSON.stringify(a).includes('Secret notes'),false);
  const session = await C.unlock(a,password);
  assert.deepEqual(session.value,fixture);
  const saved = await session.seal({schema:'simulatte.privateDiagram.v1',diagram:{name:'Private edits'}});
  assert.equal(JSON.stringify(saved).includes('Private edits'),false);
  assert.deepEqual(await session.open(saved),{schema:'simulatte.privateDiagram.v1',diagram:{name:'Private edits'}});
  session.lock(); assert.equal(session.value,null);
  await assert.rejects(session.seal({}),/locked/); await assert.rejects(session.open(saved),/locked/);
});

test('wrong passwords and tampered ciphertext, IVs and salts fail authentication', async () => {
  const encrypted = await C.encrypt(fixture,password);
  await assert.rejects(C.unlock(encrypted,'wrong-password'),/Incorrect password/);
  for(const field of ['ciphertext','iv','salt']){
    const changed = structuredClone(encrypted);
    const owner=field==='salt'?changed.kdf:changed;
    const bytes=Buffer.from(owner[field],'base64');bytes[0]^=1;owner[field]=bytes.toString('base64');
    await assert.rejects(C.unlock(changed,password),/Incorrect password/);
  }
  for(const mutate of [e=>e.kdf.iterations=1,e=>e.algorithm='AES-CBC',e=>e.schema='unknown']){
    const changed=structuredClone(encrypted);mutate(changed);
    await assert.rejects(C.unlock(changed,password),/Unsupported/);
  }
});
