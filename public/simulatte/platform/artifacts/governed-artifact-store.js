(function attachGovernedArtifactStore(root, factory) {
  const receipts = typeof module === 'object' && module.exports
    ? require('../../runtime/canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const api = factory(receipts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGovernedArtifactStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGovernedArtifactStoreModule(receipts) {
  if (!receipts || typeof receipts.sha256Hex !== 'function') {
    throw new Error('governed_artifact_store_dependency_missing: canonical receipts are required');
  }

  // Persistent source cache for large governed artifacts, keyed by content hash. Cache
  // hits are rehashed and revalidated because the IndexedDB key is not proof of content.
  // The cache degrades to a no-op where IndexedDB is unavailable.
  const ARTIFACT_DB = 'simulatte-artifact-cache';
  const ARTIFACT_STORE = 'artifacts';
  const CACHE_MIN_BYTES = 262144;
  let artifactDbPromise = null;

  function openArtifactDb() {
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    if (!artifactDbPromise) {
      artifactDbPromise = new Promise((resolve) => {
        let request;
        try { request = indexedDB.open(ARTIFACT_DB, 1); } catch { resolve(null); return; }
        request.onupgradeneeded = () => request.result.createObjectStore(ARTIFACT_STORE, { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      });
    }
    return artifactDbPromise;
  }

  async function artifactCacheGet(key) {
    const database = await openArtifactDb();
    if (!database) return null;
    return new Promise((resolve) => {
      try {
        const request = database.transaction(ARTIFACT_STORE, 'readonly').objectStore(ARTIFACT_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  async function artifactCachePut(key, entry) {
    const database = await openArtifactDb();
    if (!database) return;
    await new Promise((resolve) => {
      try {
        const transaction = database.transaction(ARTIFACT_STORE, 'readwrite');
        transaction.objectStore(ARTIFACT_STORE).put({ key, text: entry.text });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch { resolve(); }
    });
  }

  async function artifactCacheDelete(key) {
    const database = await openArtifactDb();
    if (!database) return;
    await new Promise((resolve) => {
      try {
        const transaction = database.transaction(ARTIFACT_STORE, 'readwrite');
        transaction.objectStore(ARTIFACT_STORE).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch { resolve(); }
    });
  }

  function createGovernedArtifactStore({ transport, schemas = null, persistentCache = null } = {}) {
    if (!transport || typeof transport.readText !== 'function') {
      throw artifactError('artifact_transport_missing', 'Governed artifact store expected a transport readText port', null);
    }
    const persistent = persistentCache || {
      get: artifactCacheGet,
      put: artifactCachePut,
      delete: artifactCacheDelete,
    };
    if (typeof persistent.get !== 'function' || typeof persistent.put !== 'function' || typeof persistent.delete !== 'function') {
      throw artifactError('artifact_persistent_cache_invalid', 'Governed artifact store expected get, put, and delete cache operations', null);
    }

    async function readJson(url) {
      const loaded = await transport.readText(url);
      return parseJsonDocument(loaded);
    }

    const cache = new Map();

    async function resolve(reference, { baseUrl, key = reference?.id || 'artifact' } = {}) {
      validateReference(reference, key);
      if (typeof baseUrl !== 'string' || !baseUrl) {
        throw artifactError('artifact_base_url_missing', `${key} expected a base URL`, { key, baseUrl: baseUrl || null });
      }
      const url = new URL(reference.path, baseUrl).toString();
      const cacheKey = `${url}|${reference.sha256 || reference.integrity}|${reference.schemaId || ''}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const artifactKey = `${url}|${reference.sha256}`;
      let cacheMode = 'network';
      let cachedEntry = await persistent.get(artifactKey);
      if (cachedEntry && typeof cachedEntry.text !== 'string') {
        await persistent.delete(artifactKey);
        cachedEntry = null;
      }
      let loaded;
      if (cachedEntry) {
        cacheMode = 'persistent';
        try {
          loaded = await verifyJsonArtifact({ text: cachedEntry.text, url, response: null }, reference, { key, url, schemas, cacheMode });
        } catch (error) {
          await persistent.delete(artifactKey);
          throw error;
        }
      } else {
        const fetched = await transport.readText(url);
        loaded = await verifyJsonArtifact(fetched, reference, { key, url, schemas, cacheMode });
        if (loaded.text.length >= CACHE_MIN_BYTES) await persistent.put(artifactKey, { text: loaded.text });
      }
      const { text, value, response, url: loadedUrl, parseDurationMs, sha256: actualHash } = loaded;
      const dependencies = await resolveDependencies(reference, value, loadedUrl, key);
      const result = Object.freeze({
        text,
        value,
        url: loadedUrl,
        response,
        sha256: actualHash,
        dependencies,
        receipt: Object.freeze({
          schema: 'simulatte.governedArtifactReceipt.v1',
          id: reference.id,
          url,
          sha256: actualHash,
          schemaId: reference.schemaId || null,
          dependencyIds: Object.freeze([...dependencies.keys()].sort()),
          cacheIdentity: cacheKey,
          cacheMode,
          parseDurationMs,
        }),
      });
      cache.set(cacheKey, result);
      return result;
    }

    async function resolveText(reference, { baseUrl, key = reference?.id || 'artifact' } = {}) {
      validateTextReference(reference, key);
      const url = new URL(reference.path, baseUrl).toString();
      const cacheKey = `${url}|${reference.integrity}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const loaded = await transport.readText(url);
      const actualIntegrity = `sha384-${await receipts.sha384Hex(loaded.text)}`;
      if (actualIntegrity !== reference.integrity) {
        throw artifactError('asset_integrity_mismatch', `${key} ${url} expected ${reference.integrity}, received ${actualIntegrity}`, {
          key, url, expectedIntegrity: reference.integrity, actualIntegrity,
        });
      }
      const result = Object.freeze({ ...loaded, integrity: actualIntegrity, cacheIdentity: cacheKey });
      cache.set(cacheKey, result);
      return result;
    }

    async function resolveDependencies(reference, value, loadedUrl, key) {
      const declarations = reference.dependencies || value.dependencies || [];
      if (!Array.isArray(declarations)) throw artifactError('artifact_dependencies_invalid', `${key} dependencies expected an array`, { key });
      if (!declarations.length) return new Map();
      return resolveGraph(declarations.map((dependency, index) => ({
        key: dependency.key || dependency.id || `${key}:dependency:${index}`,
        reference: dependency,
        baseUrl: loadedUrl,
      })));
    }

    async function resolveGraph(rows, { baseUrl } = {}) {
      if (!Array.isArray(rows)) throw artifactError('artifact_graph_invalid', 'Artifact graph expected an array', { rows });
      const keys = new Set();
      rows.forEach((row, index) => {
        if (!row || typeof row.key !== 'string' || !row.key) throw artifactError('artifact_graph_key_invalid', `Artifact graph row ${index} expected a key`, { index });
        if (keys.has(row.key)) throw artifactError('artifact_graph_key_duplicate', `Artifact graph key ${row.key} is duplicated`, { key: row.key });
        keys.add(row.key);
      });
      const resolved = await Promise.all(rows.map(async (row) => [
        row.key,
        await resolve(row.reference, { baseUrl: row.baseUrl || baseUrl, key: row.key }),
      ]));
      return new Map(resolved);
    }

    function clear() {
      cache.clear();
    }

    return Object.freeze({ readJson, resolve, resolveText, resolveGraph, clear });
  }

  async function verifyJsonArtifact(loaded, reference, { key, url, schemas, cacheMode }) {
    if (!loaded || typeof loaded.text !== 'string') {
      throw artifactError('artifact_transport_result_invalid', `${key} ${url} expected artifact text`, { key, url, cacheMode });
    }
    const actualHash = await receipts.sha256Hex(loaded.text);
    if (actualHash !== reference.sha256) {
      throw artifactError('asset_hash_mismatch', `${key} ${url} expected ${reference.sha256}, received ${actualHash}`, {
        key,
        url,
        cacheMode,
        expectedSha256: reference.sha256,
        actualSha256: actualHash,
      });
    }
    const parsed = parseJsonDocument({
      text: loaded.text,
      url: loaded.url || url,
      response: loaded.response || null,
    });
    if (parsed.value.id !== reference.id) {
      throw artifactError('asset_identity_mismatch', `${key} expected ID ${reference.id}, received ${parsed.value.id || 'missing'}`, {
        key,
        cacheMode,
        expectedId: reference.id,
        actualId: parsed.value.id || null,
      });
    }
    if (reference.schemaId) {
      if (!schemas || typeof schemas.validate !== 'function') {
        throw artifactError('artifact_schema_registry_missing', `${key} declares schema ${reference.schemaId} but no schema registry is configured`, { key, schemaId: reference.schemaId, cacheMode });
      }
      schemas.validate(reference.schemaId, parsed.value);
    }
    return Object.freeze({ ...parsed, value: deepFreeze(parsed.value), sha256: actualHash });
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function parseJsonDocument(loaded) {
    try {
      const startedAt = performanceNow();
      const value = JSON.parse(loaded.text);
      return Object.freeze({
        text: loaded.text,
        value,
        url: loaded.url,
        response: loaded.response,
        parseDurationMs: roundedDuration(performanceNow() - startedAt),
      });
    } catch (error) {
      throw artifactError('asset_json_invalid', `${loaded.url} expected valid JSON, received ${error.message}`, { url: loaded.url });
    }
  }

  function performanceNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function roundedDuration(value) {
    return Math.round(Math.max(0, value) * 1000) / 1000;
  }

  function validateReference(reference, key) {
    if (!reference || typeof reference !== 'object') throw artifactError('artifact_reference_missing', `${key} expected an artifact reference`, { key });
    for (const field of ['id', 'path', 'sha256']) {
      if (typeof reference[field] !== 'string' || !reference[field]) {
        throw artifactError('artifact_reference_invalid', `${key} expected reference.${field}`, { key, field });
      }
    }
  }

  function validateTextReference(reference, key) {
    if (!reference || typeof reference !== 'object') throw artifactError('artifact_reference_missing', `${key} expected an artifact reference`, { key });
    for (const field of ['id', 'path', 'integrity']) {
      if (typeof reference[field] !== 'string' || !reference[field]) throw artifactError('artifact_reference_invalid', `${key} expected reference.${field}`, { key, field });
    }
    if (!/^sha384-[a-f0-9]{96}$/.test(reference.integrity)) {
      throw artifactError('artifact_integrity_invalid', `${key} expected a lowercase SHA-384 integrity`, { key, integrity: reference.integrity });
    }
  }

  function artifactError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteArtifactError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createGovernedArtifactStore, parseJsonDocument, validateReference, validateTextReference };
});
