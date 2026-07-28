(function attachNycRealEstateForecastStatistics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstateForecastStatistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstateForecastStatistics() {
  function weightedMedian(rows) {
    const sorted = rows.slice().sort((left, right) => left.value - right.value);
    const total = sorted.reduce((sum, row) => sum + row.weight, 0);
    let cumulative = 0;
    for (const row of sorted) {
      cumulative += row.weight;
      if (cumulative >= total / 2) return row.value;
    }
    return sorted.at(-1)?.value || 0;
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    const index = (values.length - 1) * ratio;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return values[lower];
    return values[lower] + (values[upper] - values[lower]) * (index - lower);
  }

  function gaussian(random) {
    const left = Math.max(Number.EPSILON, random());
    const right = Math.max(Number.EPSILON, random());
    return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
  }

  function seededRandom(seed) {
    let state = hash32(seed) || 1;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function stableIdentity(value) {
    return hash32(stableStringify(value)).toString(16).padStart(8, '0');
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function hash32(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function groupBy(rows, keyFor) {
    const result = new Map();
    rows.forEach((row) => {
      const key = keyFor(row);
      const current = result.get(key) || [];
      current.push(row);
      result.set(key, current);
    });
    return result;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function rounded(value, places) {
    const scale = 10 ** places;
    return Math.round(value * scale) / scale;
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  return Object.freeze({
    clamp,
    deepFreeze,
    gaussian,
    groupBy,
    percentile,
    rounded,
    seededRandom,
    stableIdentity,
    weightedMedian,
  });
});
