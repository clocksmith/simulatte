(function attachSchemaRegistry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSchemaRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSchemaRegistryModule() {
  function createSchemaRegistry(initialValidators = {}) {
    const validators = new Map();
    Object.entries(initialValidators).forEach(([id, validate]) => register(id, validate));

    function register(id, validate) {
      if (typeof id !== 'string' || !id) throw schemaError('schema_id_invalid', 'Schema registry expected a non-empty ID', { id });
      if (typeof validate !== 'function') throw schemaError('schema_validator_invalid', `Schema ${id} expected a validator function`, { id });
      if (validators.has(id)) throw schemaError('schema_id_duplicate', `Schema ${id} is already registered`, { id });
      validators.set(id, validate);
      return id;
    }

    function validate(id, value) {
      const validator = validators.get(id);
      if (!validator) throw schemaError('schema_unknown', `Schema registry has no validator for ${id}`, { id, knownIds: [...validators.keys()].sort() });
      const result = validator(value);
      if (result === false) throw schemaError('schema_validation_failed', `Artifact failed schema ${id}`, { id });
      return value;
    }

    const api = Object.freeze({
      register,
      validate,
      ids() { return Object.freeze([...validators.keys()].sort()); },
    });
    return api;
  }

  function schemaError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSchemaError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createSchemaRegistry };
});
