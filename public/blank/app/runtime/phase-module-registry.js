(function attachSimulattePhaseModuleRegistry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhaseModuleRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhaseModuleRegistry() {
  const families = new Map();

  function normalizedId(value, label) {
    const id = String(value || '').trim();
    if (!id) throw new Error(`Simulatte phase module ${label} is required`);
    return id;
  }

  function recordFor(familyId) {
    const id = normalizedId(familyId, 'family ID');
    if (!families.has(id)) {
      families.set(id, {
        id,
        exports: Object.create(null),
        owners: new Map(),
        requiredExports: new Set(),
        finalizedFacade: null,
      });
    }
    return families.get(id);
  }

  function family(familyId) {
    return recordFor(familyId).exports;
  }

  function define(familyId, moduleId, moduleExports) {
    const record = recordFor(familyId);
    const owner = normalizedId(moduleId, 'owner ID');
    if (record.finalizedFacade) {
      throw new Error(`Simulatte phase module family "${record.id}" is already finalized`);
    }
    if (!moduleExports || typeof moduleExports !== 'object' || Array.isArray(moduleExports)) {
      throw new TypeError(`Simulatte phase module "${owner}" must define an exports object`);
    }
    const entries = Object.entries(moduleExports);
    for (const [key] of entries) {
      if (!key) throw new Error(`Simulatte phase module "${owner}" contains an empty export key`);
      if (record.owners.has(key)) {
        throw new Error(
          `Simulatte phase module export collision for "${record.id}.${key}": `
          + `"${owner}" conflicts with "${record.owners.get(key)}"`
        );
      }
    }
    for (const [key, value] of entries) {
      Object.defineProperty(record.exports, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value,
      });
      record.owners.set(key, owner);
    }
    return Object.freeze(Object.fromEntries(entries));
  }

  function requireExports(familyId, exportNames) {
    const record = recordFor(familyId);
    const names = Array.isArray(exportNames) ? exportNames : [exportNames];
    for (const name of names) record.requiredExports.add(normalizedId(name, 'required export name'));
    return Object.freeze([...record.requiredExports]);
  }

  function finalize(familyId, options = {}) {
    const record = recordFor(familyId);
    requireExports(record.id, options.requiredExports || []);
    const missing = [...record.requiredExports].filter((name) => !record.owners.has(name));
    if (missing.length) {
      throw new Error(
        `Simulatte phase module family "${record.id}" is missing required exports: ${missing.join(', ')}`
      );
    }
    if (!record.finalizedFacade) {
      record.finalizedFacade = Object.freeze({ ...record.exports });
    }
    return record.finalizedFacade;
  }

  function ownerOf(familyId, exportName) {
    const record = recordFor(familyId);
    const id = String(familyId || '').trim();
    if (!id) return null;
    return record.owners.get(String(exportName || '')) || null;
  }

  return Object.freeze({
    define,
    family,
    finalize,
    ownerOf,
    requireExports,
  });
});
