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

  function createGovernedArtifactStore({ transport, schemas = null } = {}) {
    if (!transport || typeof transport.readText !== 'function') {
      throw artifactError('artifact_transport_missing', 'Governed artifact store expected a transport readText port', null);
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
      const loaded = await readJson(url);
      const actualHash = await receipts.sha256Hex(loaded.text);
      if (actualHash !== reference.sha256) {
        throw artifactError('asset_hash_mismatch', `${key} ${url} expected ${reference.sha256}, received ${actualHash}`, {
          key,
          url,
          expectedSha256: reference.sha256,
          actualSha256: actualHash,
        });
      }
      if (loaded.value.id !== reference.id) {
        throw artifactError('asset_identity_mismatch', `${key} expected ID ${reference.id}, received ${loaded.value.id || 'missing'}`, {
          key,
          expectedId: reference.id,
          actualId: loaded.value.id || null,
        });
      }
      if (reference.schemaId) {
        if (!schemas || typeof schemas.validate !== 'function') {
          throw artifactError('artifact_schema_registry_missing', `${key} declares schema ${reference.schemaId} but no schema registry is configured`, { key, schemaId: reference.schemaId });
        }
        schemas.validate(reference.schemaId, loaded.value);
      }
      const dependencies = await resolveDependencies(reference, loaded.value, loaded.url, key);
      const result = Object.freeze({
        ...loaded,
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

  function parseJsonDocument(loaded) {
    try {
      return Object.freeze({
        text: loaded.text,
        value: JSON.parse(loaded.text),
        url: loaded.url,
        response: loaded.response,
      });
    } catch (error) {
      throw artifactError('asset_json_invalid', `${loaded.url} expected valid JSON, received ${error.message}`, { url: loaded.url });
    }
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
