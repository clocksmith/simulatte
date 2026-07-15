(function attachWorldTileStorage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldTileStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTileStorageModule() {
  function createWorkerDecoder(workerUrl, WorkerClass = Worker) {
    const worker = new WorkerClass(workerUrl);
    const pending = new Map();
    let sequence = 0;
    worker.addEventListener('message', (event) => {
      const row = pending.get(event.data?.operationId);
      if (!row) return;
      pending.delete(event.data.operationId);
      if (event.data.ok) row.resolve(event.data.value);
      else row.reject(storageError('tile_decode_failed', event.data.error));
    });
    return {
      decode(bytes) {
        const operationId = ++sequence;
        const copy = bytes.slice();
        return new Promise((resolve, reject) => {
          pending.set(operationId, { resolve, reject });
          worker.postMessage({ operationId, bytes: copy.buffer }, [copy.buffer]);
        });
      },
      destroy() {
        pending.forEach((row) => row.reject(storageError('tile_decoder_destroyed')));
        pending.clear();
        worker.terminate();
      },
    };
  }

  function createBrowserTileStores(options = {}) {
    const cacheName = options.cacheName || 'simulatte-world-manifests-v1';
    const directoryName = options.directoryName || 'simulatte-world-tiles-v1';
    const databaseName = options.databaseName || 'simulatte-world-tile-metadata-v1';
    return {
      async matchManifest(url) {
        const cache = await caches.open(cacheName);
        return cache.match(url);
      },
      async putManifest(url, response) {
        const cache = await caches.open(cacheName);
        await cache.put(url, response.clone());
      },
      async get(sha256) {
        const directory = await tileDirectory(directoryName, false);
        if (!directory) return null;
        try {
          const handle = await directory.getFileHandle(`${sha256}.tile`);
          return new Uint8Array(await (await handle.getFile()).arrayBuffer());
        } catch (error) {
          if (error.name === 'NotFoundError') return null;
          throw error;
        }
      },
      async put(sha256, bytes) {
        const directory = await tileDirectory(directoryName, true);
        const handle = await directory.getFileHandle(`${sha256}.tile`, { create: true });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
      },
      async recordMetadata(row) {
        const database = await openMetadataDatabase(databaseName);
        await transactionPromise(database, 'readwrite', (store) => store.put(row));
      },
      async metadata(id) {
        const database = await openMetadataDatabase(databaseName);
        return transactionPromise(database, 'readonly', (store) => store.get(id));
      },
    };
  }

  async function tileDirectory(name, create) {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    try {
      return await root.getDirectoryHandle(name, { create });
    } catch (error) {
      if (!create && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function openMetadataDatabase(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tiles', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionPromise(database, mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('tiles', mode);
      const request = operation(transaction.objectStore('tiles'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function storageError(code, evidence = null) {
    const error = new Error(code);
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createBrowserTileStores, createWorkerDecoder };
});
