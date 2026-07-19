(function attachSimulatteReviewBridgeStore(root, factory) {
  const api = factory(root);
  root.SimulatteReviewBridgeStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReviewBridgeStore(root) {
  const STORAGE_ENABLED = 'simulatte.trainingMode.enabled.v1';
  const LEGACY_STORAGE_ENABLED = 'simulatte.reviewBridge.enabled.v1';
  const STORAGE_SERVER = 'simulatte.reviewBridge.server.v1';
  const STORAGE_PHASE = 'simulatte.trainingMode.phase.v1';
  const STORAGE_FALLBACK = 'simulatte.trainingMode.records.v1';
  const DB_NAME = 'simulatte-training-reviews-v1';
  const DB_STORE = 'reviews';
  const DEFAULT_SERVER = 'http://127.0.0.1:4766';
  const PANEL_REFRESH_INTERVAL = 750;
  const SERVER_REFRESH_INTERVAL = 4000;

  function label(status, tag, labelText, key) {
    return Object.freeze({ status, tag, label: labelText, key });
  }

  function phaseTarget(id, labelText, from, to) {
    return Object.freeze({ id, label: labelText, from, to });
  }

  const TRAINING_LABELS = Object.freeze([
    label('pass', 'looks right', 'Looks right', '1'),
  ]);

  const PHASE_TARGETS = Object.freeze([
    phaseTarget('final', 'Final', 1, 8),
    phaseTarget('1-2', '1->2', 1, 2),
    phaseTarget('1-3', '1->3', 1, 3),
    phaseTarget('1-4', '1->4', 1, 4),
    phaseTarget('1-5', '1->5', 1, 5),
    phaseTarget('1-6', '1->6', 1, 6),
    phaseTarget('1-7', '1->7', 1, 7),
    phaseTarget('1-8', '1->8', 1, 8),
  ]);

  const PHASE_NAMES = Object.freeze({
    2: 'Language graph',
    3: 'Embedding retrieval',
    4: 'Activation cloud',
    5: 'Grounded intent',
    6: 'Simulation compile',
    7: 'VisualIR compile',
    8: 'WebGPU ready',
  });

  async function canvasHash(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function' || !root.crypto || !root.crypto.subtle) return '';
    try {
      const data = canvas.toDataURL('image/png');
      const bytes = new TextEncoder().encode(data.slice(0, 180000));
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      return hexDigest(digest, 12);
    } catch (_err) {
      return '';
    }
  }

  async function hashText(text) {
    if (!root.crypto || !root.crypto.subtle) return '';
    try {
      const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
      return hexDigest(digest, 16);
    } catch (_err) {
      return '';
    }
  }

  function hexDigest(digest, bytes) {
    return Array.from(new Uint8Array(digest)).slice(0, bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function reviewId() {
    const random = root.crypto && root.crypto.getRandomValues
      ? Array.from(root.crypto.getRandomValues(new Uint32Array(2))).map((row) => row.toString(36)).join('')
      : Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}`;
  }

  function fallbackRunId(prompt) {
    return `manual-${String(prompt || '').slice(0, 24).replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'blank'}`;
  }

  function cleanLocalRecord(row = {}) {
    const { _sync, ...record } = row;
    return record;
  }

  function createReviewStore(env) {
    let dbPromise = null;

    async function db() {
      if (!env.indexedDB) return null;
      if (!dbPromise) dbPromise = openDb(env.indexedDB);
      return dbPromise;
    }

    async function put(record, synced) {
      const row = {
        ...record,
        _sync: {
          queuedAt: new Date().toISOString(),
          synced: Boolean(synced),
          syncedAt: synced ? new Date().toISOString() : '',
        },
      };
      const database = await db();
      if (database) {
        try {
          await requestPromise(database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(row));
          return row;
        } catch (_err) {}
      }
      return putFallback(row);
    }

    async function all() {
      const database = await db();
      if (database) {
        try {
          return await requestPromise(database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll());
        } catch (_err) {}
      }
      return fallbackRows();
    }

    async function queued() {
      return (await all()).filter((row) => !(row._sync && row._sync.synced));
    }

    async function countQueued() {
      return (await queued()).length;
    }

    async function markSynced(id) {
      const row = (await all()).find((entry) => entry.id === id);
      if (!row) return;
      await put(cleanLocalRecord(row), true);
    }

    function putFallback(row) {
      const rows = fallbackRows().filter((entry) => entry.id !== row.id);
      rows.push(row);
      try {
        env.localStorage.setItem(STORAGE_FALLBACK, JSON.stringify(rows.slice(-500)));
      } catch (_err) {}
      return row;
    }

    function fallbackRows() {
      try {
        return JSON.parse(env.localStorage.getItem(STORAGE_FALLBACK) || '[]');
      } catch (_err) {
        return [];
      }
    }

    return { all, countQueued, markSynced, put, queued };
  }

  function openDb(indexedDB) {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          database.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  return {
    STORAGE_ENABLED,
    LEGACY_STORAGE_ENABLED,
    STORAGE_SERVER,
    STORAGE_PHASE,
    STORAGE_FALLBACK,
    DB_NAME,
    DB_STORE,
    DEFAULT_SERVER,
    PANEL_REFRESH_INTERVAL,
    SERVER_REFRESH_INTERVAL,
    TRAINING_LABELS,
    PHASE_TARGETS,
    PHASE_NAMES,
    label,
    phaseTarget,
    canvasHash,
    hashText,
    hexDigest,
    reviewId,
    fallbackRunId,
    cleanLocalRecord,
    createReviewStore,
    openDb,
    requestPromise,
  };
});
