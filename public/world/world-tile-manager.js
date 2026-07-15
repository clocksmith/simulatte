(function attachWorldTileManager(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldTileManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTileManagerModule() {
  function createWorldTileManager(options = {}) {
    const fetchBytes = options.fetchBytes || defaultFetchBytes;
    const hashBytes = options.hashBytes || defaultHashBytes;
    const decode = options.decode || defaultDecode;
    const validateSeams = options.validateSeams || (() => true);
    const upload = options.upload || (async (decoded) => ({ resource: decoded, gpuBytes: 0 }));
    const dispose = options.dispose || (() => {});
    const cache = options.cache || null;
    const maximumCpuBytes = options.maximumCpuBytes ?? 256 * 1024 * 1024;
    const maximumGpuBytes = options.maximumGpuBytes ?? 512 * 1024 * 1024;
    const now = options.now || (() => Date.now());
    const active = new Map();
    const pinned = new Set();
    const operations = new Map();
    const events = [];
    let operationSequence = 0;

    function seedActive(rows) {
      rows.forEach((row) => {
        validateManifestEntry(row.entry);
        active.set(row.entry.id, activeRow(row.entry, row.decoded, row.resource, row.cpuBytes, row.gpuBytes, now()));
      });
      evict();
      return snapshot();
    }

    async function requestTile(entry, requestOptions = {}) {
      const result = await requestSet([entry], requestOptions);
      return { ...result, tile: result.tiles[0] || null };
    }

    async function requestSet(entries, requestOptions = {}) {
      entries.forEach(validateManifestEntry);
      const operationId = ++operationSequence;
      const startedAt = now();
      const controllers = entries.map((entry) => beginOperation(entry.id, operationId));
      record('candidate_requested', operationId, { tileIds: entries.map((entry) => entry.id) });
      let staged = [];
      try {
        staged = await Promise.all(entries.map((entry, index) => stage(entry, operationId, controllers[index].signal)));
        const supersededIds = entries.filter((entry) => operations.get(entry.id)?.operationId !== operationId).map((entry) => entry.id);
        if (supersededIds.length) throw tileError('tile_request_superseded', { supersededIds });
        staged.forEach((row) => validateSeams(row.decoded, row.entry, active, staged));
        record('seams_validated', operationId, { tileIds: entries.map((entry) => entry.id) });
        const requestedPins = new Set(requestOptions.pinIds || []);
        if (requestOptions.pin) entries.forEach((entry) => requestedPins.add(entry.id));
        const evictedIds = activationEvictionPlan(staged, requestedPins);
        const priorRows = entries.map((entry) => active.get(entry.id) || null);
        staged.forEach((row) => {
          active.set(row.entry.id, activeRow(row.entry, row.decoded, row.resource, row.cpuBytes, row.gpuBytes, now()));
          if (requestedPins.has(row.entry.id)) pinned.add(row.entry.id);
        });
        priorRows.filter(Boolean).forEach((row) => dispose(row.resource, row.entry));
        evictedIds.forEach((id) => {
          const row = active.get(id);
          active.delete(id);
          dispose(row.resource, row.entry);
        });
        record('tile_set_activated', operationId, {
          tileIds: entries.map((entry) => entry.id),
          evictedIds,
          durationMs: now() - startedAt,
        });
        return {
          schema: 'simulatte.worldTileActivationReceipt.v1',
          operationId,
          status: 'activated',
          tileIds: entries.map((entry) => entry.id),
          tiles: staged.map(publicTileRow),
          evictedIds,
          activeStatePreservedUntilActivation: true,
          durationMs: now() - startedAt,
        };
      } catch (error) {
        staged.forEach((row) => dispose(row.resource, row.entry));
        record('tile_set_failed', operationId, {
          tileIds: entries.map((entry) => entry.id),
          code: error.code || 'tile_load_failed',
          durationMs: now() - startedAt,
        });
        throw error;
      } finally {
        entries.forEach((entry) => {
          if (operations.get(entry.id)?.operationId === operationId) operations.delete(entry.id);
        });
      }
    }

    async function stage(entry, operationId, signal) {
      let bytes = await cache?.get?.(entry.sha256);
      const cacheHit = Boolean(bytes);
      if (!bytes) {
        bytes = await fetchBytes(entry.url, signal);
        await cache?.put?.(entry.sha256, bytes);
      }
      const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const actualSha256 = await hashBytes(normalized);
      if (actualSha256 !== entry.sha256) throw tileError('tile_hash_mismatch', { tileId: entry.id, expectedSha256: entry.sha256, actualSha256 });
      record('tile_bytes_verified', operationId, { tileId: entry.id, byteLength: normalized.byteLength, cacheHit });
      const decoded = await decode(normalized, entry, signal);
      record('tile_decoded', operationId, { tileId: entry.id });
      const uploaded = await upload(decoded, entry, signal);
      record('tile_uploaded_inactive', operationId, { tileId: entry.id, gpuBytes: uploaded.gpuBytes || 0 });
      return {
        entry,
        decoded,
        resource: uploaded.resource,
        cpuBytes: normalized.byteLength,
        gpuBytes: uploaded.gpuBytes || 0,
        cacheHit,
      };
    }

    function beginOperation(tileId, operationId) {
      operations.get(tileId)?.controller.abort('superseded');
      const controller = new AbortController();
      operations.set(tileId, { operationId, controller });
      return controller;
    }

    function pin(tileId) {
      if (!active.has(tileId)) throw tileError('tile_pin_missing', { tileId });
      pinned.add(tileId);
    }

    function unpin(tileId) {
      pinned.delete(tileId);
      return evict();
    }

    function touch(tileId) {
      const row = active.get(tileId);
      if (!row) return false;
      row.lastAccessedAt = now();
      return true;
    }

    function cancel(tileId) {
      const operation = operations.get(tileId);
      if (!operation) return false;
      operation.controller.abort('cancelled');
      operations.delete(tileId);
      return true;
    }

    function activationEvictionPlan(staged, requestedPins) {
      const replacingIds = new Set(staged.map((row) => row.entry.id));
      const protectedIds = new Set(replacingIds);
      const projected = [...active.values()].filter((row) => !replacingIds.has(row.entry.id));
      staged.forEach((row) => projected.push(activeRow(row.entry, row.decoded, row.resource, row.cpuBytes, row.gpuBytes, now())));
      const effectivePins = new Set([...pinned, ...requestedPins]);
      let cpuBytes = projected.reduce((sum, row) => sum + row.cpuBytes, 0);
      let gpuBytes = projected.reduce((sum, row) => sum + row.gpuBytes, 0);
      const evictedIds = [];
      const candidates = projected.filter((row) => !effectivePins.has(row.entry.id) && !protectedIds.has(row.entry.id))
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt || left.entry.id.localeCompare(right.entry.id));
      while ((cpuBytes > maximumCpuBytes || gpuBytes > maximumGpuBytes) && candidates.length) {
        const row = candidates.shift();
        evictedIds.push(row.entry.id);
        cpuBytes -= row.cpuBytes;
        gpuBytes -= row.gpuBytes;
      }
      if (cpuBytes > maximumCpuBytes || gpuBytes > maximumGpuBytes) {
        throw tileError('tile_budget_exhausted_by_pins', { cpuBytes, gpuBytes, maximumCpuBytes, maximumGpuBytes });
      }
      return evictedIds;
    }

    function evict(protectedIds = new Set()) {
      const evicted = [];
      const totals = () => [...active.values()].reduce((sum, row) => ({
        cpuBytes: sum.cpuBytes + row.cpuBytes,
        gpuBytes: sum.gpuBytes + row.gpuBytes,
      }), { cpuBytes: 0, gpuBytes: 0 });
      let residency = totals();
      const candidates = [...active.values()].filter((row) => !pinned.has(row.entry.id) && !protectedIds.has(row.entry.id))
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt || left.entry.id.localeCompare(right.entry.id));
      while ((residency.cpuBytes > maximumCpuBytes || residency.gpuBytes > maximumGpuBytes) && candidates.length) {
        const row = candidates.shift();
        active.delete(row.entry.id);
        dispose(row.resource, row.entry);
        evicted.push(row.entry.id);
        residency = totals();
      }
      if (residency.cpuBytes > maximumCpuBytes || residency.gpuBytes > maximumGpuBytes) {
        throw tileError('tile_budget_exhausted_by_pins', { ...residency, maximumCpuBytes, maximumGpuBytes });
      }
      return evicted;
    }

    function snapshot() {
      const rows = [...active.values()].sort((left, right) => left.entry.id.localeCompare(right.entry.id));
      return {
        schema: 'simulatte.worldTileResidencySnapshot.v1',
        activeTiles: rows.map(publicActiveRow),
        pinnedTileIds: [...pinned].sort(),
        inFlightTileIds: [...operations.keys()].sort(),
        cpuBytes: rows.reduce((sum, row) => sum + row.cpuBytes, 0),
        gpuBytes: rows.reduce((sum, row) => sum + row.gpuBytes, 0),
        maximumCpuBytes,
        maximumGpuBytes,
        events: structuredClone(events),
      };
    }

    function activeResource(tileId) {
      touch(tileId);
      return active.get(tileId)?.resource || null;
    }

    function record(phase, operationId, detail) {
      events.push({ sequence: events.length + 1, phase, operationId, timestampMs: now(), ...detail });
    }

    return { activeResource, cancel, pin, requestSet, requestTile, seedActive, snapshot, touch, unpin };
  }

  function activeRow(entry, decoded, resource, cpuBytes, gpuBytes, timestamp) {
    return { entry, decoded, resource, cpuBytes, gpuBytes, activatedAt: timestamp, lastAccessedAt: timestamp };
  }

  function publicTileRow(row) {
    return { id: row.entry.id, sha256: row.entry.sha256, cpuBytes: row.cpuBytes, gpuBytes: row.gpuBytes, cacheHit: row.cacheHit };
  }

  function publicActiveRow(row) {
    return { id: row.entry.id, sha256: row.entry.sha256, cpuBytes: row.cpuBytes, gpuBytes: row.gpuBytes, activatedAt: row.activatedAt, lastAccessedAt: row.lastAccessedAt };
  }

  function validateManifestEntry(entry) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) throw tileError('tile_id_invalid');
    if (typeof entry.url !== 'string' || !entry.url) throw tileError('tile_url_invalid', { tileId: entry.id });
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw tileError('tile_sha256_invalid', { tileId: entry.id });
  }

  async function defaultFetchBytes(url, signal) {
    const response = await fetch(url, { signal, cache: 'no-cache' });
    if (!response.ok) throw tileError('tile_fetch_failed', { url, status: response.status });
    return new Uint8Array(await response.arrayBuffer());
  }

  async function defaultHashBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  function defaultDecode(bytes) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function tileError(code, evidence = null) {
    const error = new Error(code);
    error.name = 'WorldTileManagerError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createWorldTileManager, defaultHashBytes, tileError };
});
