(function (root, factory) {
  const world = typeof module === 'object' && module.exports ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec;
  const scene = typeof module === 'object' && module.exports ? require('./scene.js') : root.MotorcycleScene;
  const api = factory(world, scene);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleRecords = api;
})(globalThis, function (world, scene) {
  const bytes = value => new TextEncoder().encode(world.canonicalJson(value));
  const hex = buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
  async function sign(spec, record) {
    scene.validate(spec);
    if (record.worldSpecHash !== spec.contentHash) throw new Error('Result does not match the program');
    const payload = JSON.parse(JSON.stringify({ spec, record }));
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, bytes(payload));
    return { schema: 'simulatte.signedSimulatedEvent.v1', payload, digest: hex(await crypto.subtle.digest('SHA-256', bytes(payload))),
      publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), signature: hex(signature),
      identity: 'Ephemeral local simulation signer; no real vehicle identity or enforcement authority.' };
  }
  async function verify(bundle) {
    if (bundle?.schema !== 'simulatte.signedSimulatedEvent.v1' || !/^[0-9a-f]{128}$/.test(bundle.signature)) throw new Error('Unsupported signed simulated record');
    scene.validate(bundle.payload.spec);
    if (bundle.payload.record.worldSpecHash !== bundle.payload.spec.contentHash) throw new Error('Record and program identities differ');
    if (hex(await crypto.subtle.digest('SHA-256', bytes(bundle.payload))) !== bundle.digest) throw new Error('Record digest mismatch');
    const key = await crypto.subtle.importKey('jwk', bundle.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      Uint8Array.from(bundle.signature.match(/../g), pair => parseInt(pair, 16)), bytes(bundle.payload))) throw new Error('Record signature mismatch');
    return bundle.payload;
  }
  return { sign, verify };
});
