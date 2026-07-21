(function attachImmutableDataCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteImmutableDataCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createImmutableDataCatalogModule() {
  function createDataCatalog(entries = []) {
    if (!Array.isArray(entries)) throw catalogError('data_catalog_entries_invalid', 'Data catalog expected an entries array', null);
    const rowsById = new Map();
    const frozenValues = new WeakSet();
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
