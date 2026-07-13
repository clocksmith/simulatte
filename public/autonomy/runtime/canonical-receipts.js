(function attachAutonomyCanonicalReceipts(root, factory) {
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(root, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyReceipts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyCanonicalReceipts(root, nodeCrypto) {
  const HASH_PATTERN = /^[a-f0-9]{64}$/;

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value, '$'));
  }

  function canonicalValue(value, path) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`Canonical JSON at ${path} rejects non-finite numbers`);
      return Object.is(value, -0) ? 0 : value;
    }
    if (Array.isArray(value)) return value.map((row, index) => canonicalValue(row, `${path}[${index}]`));
    if (typeof value !== 'object') throw new TypeError(`Canonical JSON at ${path} rejects ${typeof value}`);
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      const row = value[key];
      if (row === undefined || typeof row === 'function' || typeof row === 'symbol' || typeof row === 'bigint') {
        throw new TypeError(`Canonical JSON at ${path}.${key} rejects ${typeof row}`);
      }
      output[key] = canonicalValue(row, `${path}.${key}`);
    });
    return output;
  }

  async function sha256Hex(value) {
    const text = typeof value === 'string' ? value : canonicalJson(value);
    const bytes = new TextEncoder().encode(text);
    if (root.crypto && root.crypto.subtle) {
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), (row) => row.toString(16).padStart(2, '0')).join('');
    }
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
    throw new Error('simulatte.autonomyReceiptChain.v1 expected Web Crypto SHA-256, received no compatible provider');
  }

  function createReceiptChain() {
    return {
      schema: 'simulatte.autonomyReceiptChain.v1',
      algorithm: 'sha256-canonical-json-chain-v1',
      terminalHash: '0'.repeat(64),
      entries: [],
    };
  }

  async function appendReceiptEntry(chain, payload) {
    if (!chain || chain.schema !== 'simulatte.autonomyReceiptChain.v1') {
      throw new Error(`Receipt chain expected simulatte.autonomyReceiptChain.v1, received ${chain && chain.schema || 'missing'}`);
    }
    const sequence = chain.entries.length;
    const previousHash = chain.terminalHash;
    const payloadHash = await sha256Hex(payload);
    const hash = await sha256Hex({ sequence, previousHash, payloadHash });
    const entry = {
      schema: 'simulatte.autonomyReceiptEntry.v1',
      sequence,
      previousHash,
      payloadHash,
      hash,
      payload,
    };
    chain.entries.push(entry);
    chain.terminalHash = hash;
    return entry;
  }

  async function verifyReceiptChain(chain) {
    if (!chain || chain.schema !== 'simulatte.autonomyReceiptChain.v1') {
      return { pass: false, reason: 'invalid_chain_schema', entryCount: 0, terminalHash: null };
    }
    let previousHash = '0'.repeat(64);
    for (let index = 0; index < chain.entries.length; index += 1) {
      const entry = chain.entries[index];
      if (entry.sequence !== index || entry.previousHash !== previousHash || !HASH_PATTERN.test(entry.hash || '')) {
        return { pass: false, reason: 'entry_link_mismatch', failedSequence: index, entryCount: chain.entries.length, terminalHash: chain.terminalHash };
      }
      const payloadHash = await sha256Hex(entry.payload);
      const hash = await sha256Hex({ sequence: index, previousHash, payloadHash });
      if (payloadHash !== entry.payloadHash || hash !== entry.hash) {
        return { pass: false, reason: 'entry_hash_mismatch', failedSequence: index, entryCount: chain.entries.length, terminalHash: chain.terminalHash };
      }
      previousHash = entry.hash;
    }
    const pass = previousHash === chain.terminalHash;
    return {
      pass,
      reason: pass ? 'verified' : 'terminal_hash_mismatch',
      entryCount: chain.entries.length,
      terminalHash: chain.terminalHash,
    };
  }

  return { canonicalJson, sha256Hex, createReceiptChain, appendReceiptEntry, verifyReceiptChain };
});
