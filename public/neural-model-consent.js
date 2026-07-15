(function attachNeuralModelConsent(root, factory) {
  const api = factory();
  root.SimulatteNeuralModelConsent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeuralModelConsentApi() {
  const STORAGE_KEY = 'simulatte.neuralModels.consent.v1';

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
    return `${Math.round(value / (1024 ** 2))} MB`;
  }

  function summarizeLock(lock) {
    if (!lock || lock.schema !== 'simulatte.modelRuntimeLock.v1') throw new Error('Invalid Simulatte model runtime lock');
    const embedding = lock.embedding;
    const reranker = lock.reranker && lock.reranker.model;
    if (!embedding?.id || !embedding?.manifestHash?.hex || !reranker?.id || !reranker?.manifestHash?.hex) {
      throw new Error('Model runtime lock is missing pinned Qwen identities');
    }
    const embeddingBytes = Number(embedding.source?.sizeBytes || 0);
    const rerankerBytes = Number(reranker.source?.sizeBytes || 0);
    const identity = [
      lock.id,
      lock.number,
      lock.doppler?.package?.version,
      embedding.id,
      embedding.manifestHash.hex,
      reranker.id,
      reranker.manifestHash.hex,
    ].join(':');
    return {
      identity,
      lockId: lock.id,
      lockNumber: lock.number,
      dopplerVersion: lock.doppler?.package?.version || '',
      embedding: { id: embedding.id, bytes: embeddingBytes, size: formatBytes(embeddingBytes) },
      reranker: { id: reranker.id, bytes: rerankerBytes, size: formatBytes(rerankerBytes) },
      totalBytes: embeddingBytes + rerankerBytes,
      totalSize: formatBytes(embeddingBytes + rerankerBytes),
    };
  }

  function readGrant(storage, bundle) {
    try {
      const value = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
      return value?.schema === 'simulatte.neuralModelConsent.v1'
        && value.bundleIdentity === bundle.identity
        && value.enabled === true;
    } catch (_error) {
      return false;
    }
  }

  function writeGrant(storage, bundle) {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      schema: 'simulatte.neuralModelConsent.v1',
      enabled: true,
      bundleIdentity: bundle.identity,
      lockId: bundle.lockId,
      lockNumber: bundle.lockNumber,
      grantedAt: new Date().toISOString(),
    }));
  }

  function revokeGrant(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (_error) {
      // Consent still turns off for this page when storage is unavailable.
    }
  }

  async function loadBundle(lockUrl, fetchImpl = fetch) {
    const response = await fetchImpl(lockUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Model runtime lock request failed (${response.status})`);
    return summarizeLock(await response.json());
  }

  function fillDialog(dialog, bundle, surface) {
    const values = {
      'embedding-name': 'Qwen 3 Embedding 0.6B',
      'embedding-size': bundle.embedding.size,
      'reranker-name': 'Qwen 3 Reranker 0.6B',
      'reranker-size': bundle.reranker.size,
      'bundle-size': bundle.totalSize,
      'download-summary': surface === 'blank'
        ? `${bundle.totalSize} total for both models`
        : `${bundle.embedding.size} on this page; ${bundle.totalSize} across Simulatte and Blank`,
      'doppler-version': bundle.dopplerVersion,
      'surface-use': surface === 'blank'
        ? 'Blank uses both models to retrieve and rerank construction evidence.'
        : 'Simulatte uses the embedder only when deterministic place matching refuses. Blank uses the reranker.',
    };
    Object.entries(values).forEach(([key, value]) => {
      const element = dialog.querySelector(`[data-neural-model="${key}"]`);
      if (element) element.textContent = value;
    });
  }

  async function createGate(options) {
    const rootNode = options.root || document;
    const storage = options.storage || rootNode.defaultView?.localStorage || localStorage;
    const toggle = typeof options.toggle === 'string' ? rootNode.getElementById(options.toggle) : options.toggle;
    const dialog = typeof options.dialog === 'string' ? rootNode.getElementById(options.dialog) : options.dialog;
    if (!toggle || !dialog) throw new Error('Neural model consent UI is incomplete');
    const bundle = await loadBundle(options.lockUrl, options.fetchImpl);
    fillDialog(dialog, bundle, options.surface);
    let enabled = readGrant(storage, bundle);
    let pending = null;
    const sync = () => {
      toggle.checked = enabled;
      toggle.setAttribute('aria-checked', String(enabled));
      if (options.status) options.status(enabled, bundle);
      if (options.onChange) options.onChange(enabled, bundle);
      const EventCtor = rootNode.defaultView?.CustomEvent || globalThis.CustomEvent;
      if (EventCtor) toggle.dispatchEvent(new EventCtor('neural-model-consent-change', { detail: { enabled, bundle } }));
    };
    const settle = (accepted) => {
      if (accepted) {
        writeGrant(storage, bundle);
        enabled = true;
      } else {
        enabled = false;
      }
      if (dialog.open) dialog.close(accepted ? 'enabled' : 'cancelled');
      sync();
      const resolve = pending;
      pending = null;
      if (resolve) resolve(enabled);
    };
    const requestEnable = () => {
      if (enabled) return Promise.resolve(true);
      if (pending) return new Promise((resolve) => {
        const previous = pending;
        pending = (value) => { previous(value); resolve(value); };
      });
      dialog.showModal();
      return new Promise((resolve) => { pending = resolve; });
    };
    const disable = () => {
      revokeGrant(storage);
      enabled = false;
      sync();
    };
    toggle.addEventListener('change', async () => {
      if (toggle.checked) await requestEnable();
      else disable();
    });
    dialog.querySelector('[data-neural-consent="accept"]')?.addEventListener('click', () => settle(true));
    dialog.querySelector('[data-neural-consent="cancel"]')?.addEventListener('click', () => settle(false));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      settle(false);
    });
    sync();
    return { bundle, isEnabled: () => enabled, requestEnable, disable, sync };
  }

  return { STORAGE_KEY, formatBytes, summarizeLock, readGrant, writeGrant, revokeGrant, loadBundle, createGate };
});
