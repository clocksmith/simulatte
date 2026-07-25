(function attachSimulatteDeterministicValues(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDeterministicValues = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDeterministicValuesApi() {
  function fnv1a32(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function fnv1a32CodePoints(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function round9(value) {
    return Number(Number(value).toFixed(9));
  }

  function unitInterval(value) {
    return fnv1a32(value) / 4294967296;
  }

  function inclusiveUnitInterval(value) {
    return fnv1a32(value) / 4294967295;
  }

  return Object.freeze({
    fnv1a32,
    fnv1a32CodePoints,
    round9,
    unitInterval,
    inclusiveUnitInterval,
  });
});
