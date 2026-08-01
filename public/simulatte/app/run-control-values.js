(function attachSimulatteRunControlValues(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRunControlValues = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteRunControlValues() {
  function normalizeValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return copyObject(value, new WeakSet());
  }

  function sameValues(left, right) {
    return sameValue(left, right);
  }

  function isRunnableResult(value) {
    return value?.status === 'running' || value?.status === 'settled';
  }

  function copyObject(value, seen) {
    if (seen.has(value)) throw new Error('simulatte_run_control_values_circular');
    seen.add(value);
    const copied = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copyValue(entry, seen)]));
    seen.delete(value);
    return copied;
  }

  function copyValue(value, seen) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => copyValue(entry, seen));
    return copyObject(value, seen);
  }

  function sameValue(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left)
        && Array.isArray(right)
        && left.length === right.length
        && left.every((entry, index) => sameValue(entry, right[index]));
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
  }

  return Object.freeze({ isRunnableResult, normalizeValues, sameValues });
});
