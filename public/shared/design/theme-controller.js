(function attachSimulatteTheme(root) {
  'use strict';

  const STORAGE_KEY = 'simulatte.theme.v1';
  const PREFERENCES = Object.freeze(['system', 'light', 'dark']);
  const LABELS = Object.freeze({ system: 'System', light: 'Light', dark: 'Dark' });
  const documentRef = root.document;
  const systemQuery = typeof root.matchMedia === 'function'
    ? root.matchMedia('(prefers-color-scheme: dark)')
    : null;

  function normalizePreference(value) {
    return PREFERENCES.includes(value) ? value : 'system';
  }

  function resolvePreference(preference, systemDark = Boolean(systemQuery?.matches)) {
    const normalized = normalizePreference(preference);
    return normalized === 'system' ? (systemDark ? 'dark' : 'light') : normalized;
  }

  function storedPreference() {
    try {
      return normalizePreference(root.localStorage?.getItem(STORAGE_KEY));
    } catch (_error) {
      return 'system';
    }
  }

  function currentPreference() {
    return normalizePreference(documentRef?.documentElement?.dataset.themePreference);
  }

  function nextPreference(preference) {
    const index = PREFERENCES.indexOf(normalizePreference(preference));
    return PREFERENCES[(index + 1) % PREFERENCES.length];
  }

  function updateControls(preference, resolved) {
    if (!documentRef) return;
    const next = nextPreference(preference);
    documentRef.querySelectorAll('[data-theme-control]').forEach((control) => {
      const button = control.querySelector('button');
      const label = control.querySelector('[data-theme-label]');
      control.dataset.preference = preference;
      control.dataset.resolvedTheme = resolved;
      if (label) label.textContent = LABELS[preference];
      if (!button) return;
      const currentDescription = preference === 'system'
        ? `System theme (${LABELS[resolved].toLowerCase()})`
        : `${LABELS[preference]} theme`;
      button.setAttribute('aria-label', `${currentDescription}. Switch to ${LABELS[next]} theme.`);
      button.title = `${currentDescription} · next: ${LABELS[next]}`;
    });
  }

  function persistPreference(preference) {
    try {
      if (!root.localStorage) return;
      if (preference === 'system') root.localStorage.removeItem(STORAGE_KEY);
      else root.localStorage.setItem(STORAGE_KEY, preference);
    } catch (_error) {
      // Theme selection remains valid for this page when storage is unavailable.
    }
  }

  function applyPreference(value, options = {}) {
    const preference = normalizePreference(value);
    const resolved = resolvePreference(preference);
    if (!documentRef?.documentElement) return Object.freeze({ preference, resolved });
    const element = documentRef.documentElement;
    element.dataset.themePreference = preference;
    element.dataset.theme = resolved;
    element.style.colorScheme = resolved;
    if (options.persist === true) persistPreference(preference);
    updateControls(preference, resolved);
    if (typeof root.CustomEvent === 'function') {
      documentRef.dispatchEvent(new root.CustomEvent('simulatte:themechange', {
        detail: Object.freeze({ preference, resolved, source: options.source || 'api' }),
      }));
    }
    return Object.freeze({ preference, resolved });
  }

  function setPreference(preference) {
    return applyPreference(preference, { persist: true, source: 'control' });
  }

  function cyclePreference() {
    return setPreference(nextPreference(currentPreference()));
  }

  function bindControls() {
    if (!documentRef) return;
    documentRef.querySelectorAll('[data-theme-control]').forEach((control) => {
      if (control.dataset.themeBound === 'true') return;
      const button = control.querySelector('button');
      if (!button) return;
      control.dataset.themeBound = 'true';
      button.addEventListener('click', cyclePreference);
    });
    updateControls(currentPreference(), resolvePreference(currentPreference()));
    const reveal = () => { documentRef.documentElement.dataset.themeReady = 'true'; };
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(reveal);
    else reveal();
  }

  const api = Object.freeze({
    storageKey: STORAGE_KEY,
    preferences: PREFERENCES,
    getPreference: currentPreference,
    resolvePreference,
    setPreference,
    cyclePreference,
  });
  root.SimulatteTheme = api;

  applyPreference(storedPreference(), { persist: false, source: 'boot' });

  if (systemQuery) {
    const synchronizeSystemTheme = () => {
      if (currentPreference() === 'system') {
        applyPreference('system', { persist: false, source: 'system' });
      }
    };
    if (typeof systemQuery.addEventListener === 'function') {
      systemQuery.addEventListener('change', synchronizeSystemTheme);
    } else if (typeof systemQuery.addListener === 'function') {
      systemQuery.addListener(synchronizeSystemTheme);
    }
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        applyPreference(event.newValue, { persist: false, source: 'storage' });
      }
    });
  }

  if (documentRef?.readyState === 'loading') {
    documentRef.addEventListener('DOMContentLoaded', bindControls, { once: true });
  } else {
    bindControls();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
