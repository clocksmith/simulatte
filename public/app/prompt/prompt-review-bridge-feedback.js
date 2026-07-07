(function attachSimulatteReviewBridgefeedback(root) {
  const scope = root.__SimulatteReviewBridgeRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    async function exportReviews() {
        const rows = (await reviewStore.all()).map(cleanLocalRecord);
        const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
        const body = jsonl ? `${jsonl}\n` : '';
        const blob = new Blob([body], { type: 'application/x-ndjson' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `simulatte-training-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        syncStatus(`exported ${rows.length}`);
      }

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

    function label(status, tag, labelText, key) {
        return Object.freeze({ status, tag, label: labelText, key });
      }

    function phaseTarget(id, labelText, from, to) {
        return Object.freeze({ id, label: labelText, from, to });
      }

    Object.assign(scope, {
      exportReviews,
      canvasHash,
      hashText,
      hexDigest,
      reviewId,
      fallbackRunId,
      cleanLocalRecord,
      createReviewStore,
      openDb,
      requestPromise,
      label,
      phaseTarget,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
