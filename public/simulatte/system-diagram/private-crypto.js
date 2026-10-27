(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulattePrivateCrypto = api;
})(globalThis, function () {
  'use strict';
  const SCHEMA = 'simulatte.encryptedDocument.v1';
  const ITERATIONS = 600000;
  const MAX_BYTES = 4 * 1024 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
  const aad = encoder.encode(SCHEMA);
  function provider() {
    if (!globalThis.crypto?.subtle) throw Error('Encryption requires HTTPS or localhost and Web Crypto support.');
    return globalThis.crypto;
  }
  function encode(bytes) {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }
  function decode(text) {
    if (typeof text !== 'string' || text.length > MAX_BYTES * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw Error('Invalid encrypted document encoding.');
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  }
  function validate(value) {
    if (value?.schema !== SCHEMA || value.algorithm !== 'AES-GCM' || value.kdf?.name !== 'PBKDF2' || value.kdf.hash !== 'SHA-256' || value.kdf.iterations !== ITERATIONS) throw Error('Unsupported encrypted document format.');
    const salt = decode(value.kdf.salt), iv = decode(value.iv), ciphertext = decode(value.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BYTES + 16) throw Error('Invalid encrypted document sizes.');
    return {salt, iv, ciphertext};
  }
  async function derive(password, salt) {
    if (typeof password !== 'string' || !password.length) throw Error('Enter the collection password.');
    const crypto = provider();
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function seal(value, key, salt) {
    if (!key) throw Error('Collection is locked.');
    const plain = encoder.encode(JSON.stringify(value));
    if (plain.length > MAX_BYTES) throw Error('Private document exceeds 4 MB.');
    const iv = provider().getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await provider().subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, plain));
    return {schema: SCHEMA, algorithm: 'AES-GCM', kdf: {name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encode(salt)}, iv: encode(iv), ciphertext: encode(ciphertext)};
  }
  async function open(value, key) {
    if (!key) throw Error('Collection is locked.');
    const {iv, ciphertext} = validate(value);
    try {
      const plain = await provider().subtle.decrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, ciphertext);
      return JSON.parse(decoder.decode(plain));
    } catch { throw Error('Incorrect password or damaged encrypted file.'); }
  }
  async function encrypt(value, password) {
    const salt = provider().getRandomValues(new Uint8Array(16));
    return seal(value, await derive(password, salt), salt);
  }
  async function sessionFor(envelope, initialKey) {
    const {salt} = validate(envelope);
    let key = initialKey;
    let contents = await open(envelope, key);
    return Object.freeze({
      get value() { return contents; },
      seal: value => seal(value, key, salt),
      open: value => {
        validate(value);
        if (value.kdf.salt !== envelope.kdf.salt) throw Error('This file belongs to a different private collection.');
        return open(value, key);
      },
      lock() { key = null; contents = null; },
    });
  }
  async function unlock(envelope, password) {
    return sessionFor(envelope, await derive(password, validate(envelope).salt));
  }
  async function unlockWithKey(envelope, encodedKey) {
    validate(envelope);
    const bytes = decode(encodedKey);
    if (bytes.length !== 32) throw Error('Invalid local collection key.');
    const key = await provider().subtle.importKey('raw', bytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
    bytes.fill(0);
    return sessionFor(envelope, key);
  }
  return Object.freeze({SCHEMA, ITERATIONS, encrypt, unlock, unlockWithKey, validate});
});
