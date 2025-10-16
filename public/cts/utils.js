export function generateId(prefix = 'id') {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

export function shallowFreeze(source) {
  if (!source || typeof source !== 'object') return source;
  const copy = { ...source };
  return Object.freeze(copy);
}

export function structuredCopy(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function debounce(fn, delay = 120) {
  let handle = 0;
  return function debounced(...args) {
    clearTimeout(handle);
    handle = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function formatPercent(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const { decimals = 2 } = options;
  return `${(numeric * 100).toFixed(decimals)}%`;
}

export function formatCurrency(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const { currency = 'USD', minimumFractionDigits = 0, maximumFractionDigits = 0 } = options;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(numeric);
}

export function focusWithin(root, selector) {
  const el = root.querySelector(selector);
  if (el) {
    requestAnimationFrame(() => el.focus({ preventScroll: false }));
  }
}
