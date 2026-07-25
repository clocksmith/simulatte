(function attachAutonomyContractPrimitives(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyContractPrimitives = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyContractPrimitives() {
  const ACTOR_TYPES = Object.freeze(['pedestrian', 'bicycle', 'scooter', 'car']);
  class AutonomyContractError extends Error {
    constructor(contract, path, expected, received) {
      super(`${contract} contract at ${path} expected ${expected}, received ${describe(received)}`);
      this.name = 'AutonomyContractError';
      this.contract = contract;
      this.path = path;
      this.expected = expected;
      this.received = received;
    }
  }
  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'string') return JSON.stringify(value);
    return typeof value;
  }
  function requireObject(value, contract, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AutonomyContractError(contract, path, 'object', value);
    }
    return value;
  }
  function requireArray(value, contract, path, minimum = 0) {
    if (!Array.isArray(value) || value.length < minimum) {
      throw new AutonomyContractError(contract, path, `array with at least ${minimum} row(s)`, value);
    }
    return value;
  }
  function requireString(value, contract, path) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new AutonomyContractError(contract, path, 'non-empty string', value);
    }
    return value;
  }
  function requireFinite(value, contract, path, minimum = -Infinity) {
    if (!Number.isFinite(value) || value < minimum) {
      throw new AutonomyContractError(contract, path, `finite number >= ${minimum}`, value);
    }
    return value;
  }
  function requireInteger(value, contract, path, minimum = 0) {
    if (!Number.isInteger(value) || value < minimum) {
      throw new AutonomyContractError(contract, path, `integer >= ${minimum}`, value);
    }
    return value;
  }
  function requireBoolean(value, contract, path) {
    if (typeof value !== 'boolean') {
      throw new AutonomyContractError(contract, path, 'boolean', value);
    }
    return value;
  }

  function requireSchema(value, expected, contract) {
    requireObject(value, contract, '$');
    if (value.schema !== expected) {
      throw new AutonomyContractError(contract, '$.schema', expected, value.schema);
    }
  }

  function requireExactValue(value, expected, contract, path) {
    if (canonicalJson(value) !== canonicalJson(expected)) {
      throw new AutonomyContractError(contract, path, `exact registry value ${canonicalJson(expected)}`, value);
    }
    return value;
  }

  function requireExactStringSet(value, expected, contract, path) {
    const actualRows = requireArray(value, contract, path).map((row, index) => requireString(row, contract, `${path}[${index}]`));
    const expectedRows = [...expected].sort();
    const sortedRows = [...actualRows].sort();
    if (new Set(actualRows).size !== actualRows.length || canonicalJson(sortedRows) !== canonicalJson(expectedRows)) {
      throw new AutonomyContractError(contract, path, `unique registry identities ${canonicalJson(expectedRows)}`, value);
    }
    return actualRows;
  }

  function canonicalJson(value) {
    return JSON.stringify(sortValue(value));
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }

  function uniqueRows(rows, contract, path) {
    const seen = new Set();
    rows.forEach((row, index) => {
      const id = requireString(row && row.id, contract, `${path}[${index}].id`);
      if (seen.has(id)) throw new AutonomyContractError(contract, `${path}[${index}].id`, 'unique id', id);
      seen.add(id);
    });
    return seen;
  }

  function pointDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function validatePointArray(points, contract, path, minimum) {
    requireArray(points, contract, path, minimum).forEach((point, index) => {
      requireFinite(point && point.x, contract, `${path}[${index}].x`);
      requireFinite(point && point.y, contract, `${path}[${index}].y`);
    });
  }

  function validateCardReferences(rows, cardIds, contract, path) {
    requireArray(rows, contract, path, 1).forEach((id, index) => {
      requireString(id, contract, `${path}[${index}]`);
      if (cardIds && !cardIds.has(id)) throw new AutonomyContractError(contract, `${path}[${index}]`, 'known feature card ID', id);
    });
  }


  return Object.freeze({
    ACTOR_TYPES,
    AutonomyContractError,
    describe,
    requireObject,
    requireArray,
    requireString,
    requireFinite,
    requireInteger,
    requireBoolean,
    requireSchema,
    requireExactValue,
    requireExactStringSet,
    canonicalJson,
    sortValue,
    uniqueRows,
    pointDistance,
    validatePointArray,
    validateCardReferences,
  });
});
