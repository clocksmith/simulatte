(function attachImmutableDataCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteImmutableDataCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createImmutableDataCatalogModule() {
  function createDataCatalog(entries = [], { loadShard = null } = {}) {
    if (!Array.isArray(entries)) throw catalogError('data_catalog_entries_invalid', 'Data catalog expected an entries array', null);
    if (loadShard !== null && typeof loadShard !== 'function') {
      throw catalogError('data_catalog_shard_loader_invalid', 'Data catalog shard loader expected a function or null', null);
    }
    const rowsById = new Map();
    const frozenValues = new WeakSet();
    const shardLoads = new Map();
    entries.forEach((entry, index) => {
      if (!entry || typeof entry.id !== 'string' || !entry.id) throw catalogError('data_catalog_id_invalid', `Data catalog entry ${index} expected an id`, { index });
      if (!Object.hasOwn(entry, 'value')) throw catalogError('data_catalog_value_missing', `Data catalog entry ${entry.id} expected a value`, { id: entry.id });
      if (rowsById.has(entry.id)) throw catalogError('data_catalog_id_duplicate', `Data catalog ID ${entry.id} is duplicated`, { id: entry.id });
      rowsById.set(entry.id, Object.freeze({ id: entry.id, value: deepFreeze(entry.value, frozenValues), receipt: deepFreeze(entry.receipt || null, frozenValues) }));
    });

    function requireDataset(id) {
      const row = rowsById.get(id);
      if (!row) throw catalogError('data_catalog_dataset_missing', `Data catalog has no dataset ${id}`, { id });
      return row.value;
    }

    function optional(id) {
      const row = rowsById.get(id);
      return row ? row.value : null;
    }

    function receipt(id) {
      const row = rowsById.get(id);
      if (!row) throw catalogError('data_catalog_dataset_missing', `Data catalog has no dataset ${id}`, { id });
      return row.receipt;
    }

    function createView(declaredDatasets) {
      if (!Array.isArray(declaredDatasets)) throw catalogError('data_catalog_view_invalid', 'Data catalog view expected declared datasets', null);
      const declarations = new Map();
      declaredDatasets.forEach((declaration, index) => {
        const row = normalizeDeclaration(declaration, index);
        if (declarations.has(row.id)) throw catalogError('data_catalog_view_id_duplicate', `Data catalog view dataset ${row.id} is duplicated`, { id: row.id });
        declarations.set(row.id, row);
      });
      declarations.forEach((declaration, id) => {
        if (declaration.required && !rowsById.has(id)) throw catalogError('data_catalog_dataset_missing', `Data catalog view requested missing dataset ${id}`, { id });
      });
      const assertAllowed = (id) => {
        if (!declarations.has(id)) throw catalogError('data_catalog_access_undeclared', `Dataset ${id} is not declared for this view`, { id, allowedIds: [...declarations.keys()].sort() });
      };
      async function loadDeclaredShard(datasetId, shardId) {
        assertAllowed(datasetId);
        if (typeof shardId !== 'string' || !shardId) {
          throw catalogError('data_catalog_shard_id_invalid', 'Dataset shard expected a non-empty ID', { datasetId, shardId });
        }
        if (!loadShard) {
          throw catalogError('data_catalog_shard_loader_missing', `Dataset ${datasetId} does not have a shard loader`, { datasetId, shardId });
        }
        const parent = rowsById.get(datasetId);
        if (!parent) throw catalogError('data_catalog_dataset_missing', `Data catalog has no dataset ${datasetId}`, { id: datasetId });
        const shardDeclarations = Array.isArray(parent.value?.shards) ? parent.value.shards : [];
        const shard = shardDeclarations.find((row) => row?.regionId === shardId || row?.id === shardId);
        if (!shard) {
          throw catalogError('data_catalog_shard_undeclared', `Dataset ${datasetId} does not declare shard ${shardId}`, {
            datasetId,
            shardId,
            availableShardIds: shardDeclarations.map((row) => row.regionId || row.id).filter(Boolean).sort(),
          });
        }
        validateShardReference(shard, datasetId);
        const cacheKey = `${datasetId}:${shard.id}:${shard.sha256}`;
        if (!shardLoads.has(cacheKey)) {
          shardLoads.set(cacheKey, Promise.resolve(loadShard(Object.freeze({
            datasetId,
            parentReceipt: parent.receipt,
            shard: deepFreeze({ ...shard }, frozenValues),
          }))).then((loaded) => {
            if (!loaded || loaded.value?.id !== shard.id || loaded.value?.schema !== shard.schemaId) {
              throw catalogError(
                'data_catalog_shard_identity_invalid',
                `Dataset shard ${shard.id} expected ID ${shard.id} and schema ${shard.schemaId}`,
                {
                  datasetId,
                  shardId,
                  actualId: loaded?.value?.id || null,
                  actualSchema: loaded?.value?.schema || null,
                }
              );
            }
            const actualHash = loaded.sha256 || loaded.receipt?.sha256;
            if (actualHash !== shard.sha256) {
              throw catalogError('data_catalog_shard_hash_mismatch', `Dataset shard ${shard.id} expected ${shard.sha256}, received ${actualHash || 'missing'}`, {
                datasetId,
                shardId,
                expectedSha256: shard.sha256,
                actualSha256: actualHash || null,
              });
            }
            return deepFreeze({
              value: loaded.value,
              receipt: {
                ...(loaded.receipt || {}),
                schema: 'simulatte.datasetShardLoadReceipt.v1',
                datasetId,
                shardId: shard.id,
                regionId: shard.regionId || null,
                sha256: shard.sha256,
                byteCount: shard.byteCount,
                schemaId: shard.schemaId,
              },
            }, frozenValues);
          }).catch((error) => {
            shardLoads.delete(cacheKey);
            throw error;
          }));
        }
        return shardLoads.get(cacheKey);
      }
      return Object.freeze({
        ids: Object.freeze([...declarations.keys()].sort()),
        require(id) {
          assertAllowed(id);
          return requireDataset(id);
        },
        optional(id) {
          assertAllowed(id);
          const row = rowsById.get(id);
          return row ? row.value : null;
        },
        receipt(id) {
          assertAllowed(id);
          return rowsById.has(id) ? receipt(id) : null;
        },
        loadShard: loadDeclaredShard,
      });
    }

    return Object.freeze({
      ids: Object.freeze([...rowsById.keys()].sort()),
      require: requireDataset,
      optional,
      receipt,
      createView,
    });
  }

  function validateShardReference(value, datasetId) {
    const requiredText = ['id', 'path', 'sha256', 'schemaId'];
    const invalidText = requiredText.find((key) => typeof value?.[key] !== 'string' || !value[key]);
    if (invalidText || !/^[a-f0-9]{64}$/.test(value.sha256)
      || !Number.isInteger(value.byteCount) || value.byteCount < 1) {
      throw catalogError('data_catalog_shard_reference_invalid', `Dataset ${datasetId} contains an invalid shard reference`, {
        datasetId,
        shard: value,
        invalidField: invalidText || null,
      });
    }
  }

  function normalizeDeclaration(declaration, index) {
    if (typeof declaration === 'string' && declaration) return Object.freeze({ id: declaration, required: true });
    if (!declaration || typeof declaration.id !== 'string' || !declaration.id || typeof declaration.required !== 'boolean') {
      throw catalogError('data_catalog_view_declaration_invalid', `Data catalog view declaration ${index} expected id and required`, { index });
    }
    return Object.freeze({ id: declaration.id, required: declaration.required });
  }

  function catalogError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteDataCatalogError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  return { createDataCatalog, deepFreeze };
});
