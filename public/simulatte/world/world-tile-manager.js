(function attachWorldTileManager(root, factory) {
  const browserTransport = typeof module === 'object' && module.exports
    ? require('../platform/transport/browser-transport.js')
    : root.SimulatteBrowserTransport;
  const api = factory(browserTransport);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldTileManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTileManagerModule(browserTransport) {
  if (!browserTransport || typeof browserTransport.createBrowserTransport !== 'function') {
    throw new Error('world_tile_manager_dependency_missing: browser transport is required');
  }

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
    const onEvent = options.onEvent || (() => {});
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
        const requestedReplacements = new Set(requestOptions.replaceIds || []);
        requestedReplacements.forEach((id) => {
          if (!active.has(id)) throw tileError('tile_replacement_missing', { tileId: id });
        });
        const evictedIds = activationEvictionPlan(staged, requestedPins, requestedReplacements);
        const priorRows = entries.map((entry) => active.get(entry.id) || null);
        const entryIds = new Set(entries.map((entry) => entry.id));
        const replacedRows = [...requestedReplacements].filter((id) => !entryIds.has(id)).map((id) => active.get(id));
        staged.forEach((row) => {
          active.set(row.entry.id, activeRow(row.entry, row.decoded, row.resource, row.cpuBytes, row.gpuBytes, now()));
          if (requestedPins.has(row.entry.id)) pinned.add(row.entry.id);
        });
        priorRows.filter(Boolean).forEach((row) => dispose(row.resource, row.entry));
        replacedRows.forEach((row) => {
          active.delete(row.entry.id);
          pinned.delete(row.entry.id);
          dispose(row.resource, row.entry);
        });
        evictedIds.forEach((id) => {
          const row = active.get(id);
          active.delete(id);
          dispose(row.resource, row.entry);
        });
        record('tile_set_activated', operationId, {
          tileIds: entries.map((entry) => entry.id),
          evictedIds,
          replacedIds: replacedRows.map((row) => row.entry.id),
          durationMs: now() - startedAt,
        });
        return {
          schema: 'simulatte.worldTileActivationReceipt.v1',
          operationId,
          status: 'activated',
          tileIds: entries.map((entry) => entry.id),
          tiles: staged.map(publicTileRow),
          evictedIds,
          replacedIds: replacedRows.map((row) => row.entry.id),
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

    function remove(tileId, options = {}) {
      const row = active.get(tileId);
      if (!row) return false;
      if (pinned.has(tileId) && !options.force) throw tileError('tile_remove_pinned', { tileId });
      active.delete(tileId);
      pinned.delete(tileId);
      dispose(row.resource, row.entry);
      record('tile_removed', ++operationSequence, { tileIds: [tileId], reason: options.reason || 'explicit-removal' });
      return true;
    }

    function activationEvictionPlan(staged, requestedPins, requestedReplacements = new Set()) {
      const protectedIds = new Set(staged.map((row) => row.entry.id));
      const replacingIds = new Set([...protectedIds, ...requestedReplacements]);
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
      const event = { sequence: events.length + 1, phase, operationId, timestampMs: now(), ...detail };
      events.push(event);
      onEvent(structuredClone(event));
    }

    return { activeResource, cancel, pin, remove, requestSet, requestTile, seedActive, snapshot, touch, unpin };
  }

  function createRecursiveSpatialResidencyManager(options = {}) {
    const scopes = options.scopes || [];
    const representations = options.representations || [];
    const simulationResidencySnapshot = options.simulationResidencySnapshot || (() => null);
    const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
    const representationById = new Map();
    const residency = new Map();
    const events = [];
    representations.forEach((representation) => {
      validateRepresentation(representation, scopeById, representationById);
      representationById.set(representation.id, Object.freeze(structuredClone(representation)));
      residency.set(representation.id, 'absent');
    });
    representations.forEach((representation) => {
      if (representation.parentRepresentationId !== null && !representationById.has(representation.parentRepresentationId)) {
        throw spatialError('spatial_parent_representation_unknown', { representationId: representation.id, parentRepresentationId: representation.parentRepresentationId });
      }
    });
    const callerEvent = options.tileOptions?.onEvent || (() => {});
    const tileManager = createWorldTileManager({
      ...(options.tileOptions || {}),
      onEvent(event) {
        applyTileEvent(event);
        callerEvent(event);
      },
    });

    function seedRepresentations(rows, requestOptions = {}) {
      const seeded = rows.map((row) => {
        const representation = requireRepresentation(row.representationId);
        return { entry: tileEntry(representation), decoded: row.decoded, resource: row.resource, cpuBytes: row.cpuBytes, gpuBytes: row.gpuBytes };
      });
      tileManager.seedActive(seeded);
      rows.forEach((row) => residency.set(row.representationId, 'resident'));
      (requestOptions.pinIds || []).forEach((id) => pin(id));
      record('representations-seeded', { representationIds: rows.map((row) => row.representationId) });
      return snapshot();
    }

    async function requestRepresentations(representationIds, requestOptions = {}) {
      const ids = [...new Set(representationIds)];
      if (!ids.length) throw spatialError('spatial_request_empty');
      const rows = ids.map(requireRepresentation);
      const replaceIds = [...new Set(requestOptions.replaceIds || [])];
      replaceIds.forEach(requireRepresentation);
      validateReplacement(rows, replaceIds);
      ids.forEach((id) => residency.set(id, 'requested'));
      record('representations-requested', { representationIds: ids, replaceIds, reason: requestOptions.reason || 'view-interest' });
      try {
        const receipt = await tileManager.requestSet(rows.map(tileEntry), {
          pinIds: requestOptions.pinIds || [],
          replaceIds,
        });
        ids.forEach((id) => residency.set(id, (requestOptions.pinIds || []).includes(id) ? 'pinned' : 'resident'));
        replaceIds.forEach((id) => residency.set(id, 'absent'));
        receipt.evictedIds.forEach((id) => residency.set(id, 'absent'));
        record('representations-activated', { representationIds: ids, replaceIds, tileReceipt: receipt });
        return Object.freeze({
          schema: 'simulatte.recursiveSpatialActivationReceipt/v1',
          status: 'activated',
          representationIds: ids,
          replacedRepresentationIds: replaceIds,
          evictedRepresentationIds: receipt.evictedIds,
          activeStatePreservedUntilActivation: receipt.activeStatePreservedUntilActivation,
          simulationResidencyUnchanged: true,
          tileReceipt: receipt,
        });
      } catch (error) {
        ids.forEach((id) => residency.set(id, tileManager.snapshot().activeTiles.some((row) => row.id === id) ? 'resident' : 'absent'));
        record('representations-failed', { representationIds: ids, replaceIds, code: error.code || 'spatial_load_failed' });
        throw error;
      }
    }

    async function prefetch(predictions, requestOptions = {}) {
      const ordered = [...predictions].sort((left, right) => right.priority - left.priority || left.representationId.localeCompare(right.representationId));
      ordered.forEach((row) => {
        requireRepresentation(row.representationId);
        if (!Number.isFinite(row.priority)) throw spatialError('spatial_prediction_priority_invalid', { representationId: row.representationId });
      });
      const absent = ordered.map((row) => row.representationId).filter((id) => residency.get(id) === 'absent');
      if (!absent.length) return Object.freeze({ schema: 'simulatte.recursiveSpatialPrefetchReceipt/v1', status: 'already-resident', representationIds: [] });
      const receipt = await requestRepresentations(absent, { ...requestOptions, reason: 'predictive-prefetch' });
      return Object.freeze({ schema: 'simulatte.recursiveSpatialPrefetchReceipt/v1', status: 'activated', representationIds: absent, activation: receipt });
    }

    function pin(representationId) {
      requireRepresentation(representationId);
      tileManager.pin(representationId);
      residency.set(representationId, 'pinned');
      record('representation-pinned', { representationId });
      return snapshot();
    }

    function unpin(representationId) {
      requireRepresentation(representationId);
      const evictedIds = tileManager.unpin(representationId);
      residency.set(representationId, tileManager.snapshot().activeTiles.some((row) => row.id === representationId) ? 'resident' : 'absent');
      evictedIds.forEach((id) => residency.set(id, 'absent'));
      record('representation-unpinned', { representationId, evictedIds });
      return snapshot();
    }

    function evictRepresentation(representationId, reason = 'view-interest-released') {
      requireRepresentation(representationId);
      if (!['resident', 'pinned'].includes(residency.get(representationId))) return false;
      residency.set(representationId, 'evicting');
      const removed = tileManager.remove(representationId, { reason });
      residency.set(representationId, 'absent');
      record('representation-evicted', { representationId, reason });
      return removed;
    }

    function activeResource(representationId) {
      requireRepresentation(representationId);
      return tileManager.activeResource(representationId);
    }

    function snapshot() {
      const tileSnapshot = tileManager.snapshot();
      const representationStates = Object.fromEntries([...residency.entries()].sort(([left], [right]) => left.localeCompare(right)));
      const scopeStates = Object.fromEntries(scopes.map((scope) => {
        const states = scope.renderRepresentationIds.filter((id) => residency.has(id)).map((id) => residency.get(id));
        return [scope.id, strongestResidency(states)];
      }));
      return Object.freeze({
        schema: 'simulatte.recursiveSpatialResidencySnapshot/v1',
        representationStates,
        scopeStates,
        tileResidency: tileSnapshot,
        simulationResidencyObservation: structuredClone(simulationResidencySnapshot()),
        events: structuredClone(events),
      });
    }

    function applyTileEvent(event) {
      if (event.phase === 'candidate_requested') event.tileIds.forEach((id) => residency.set(id, 'requested'));
      if (event.phase === 'tile_uploaded_inactive') residency.set(event.tileId, 'staged');
      if (event.phase === 'tile_set_activated') {
        event.tileIds.forEach((id) => residency.set(id, 'resident'));
        (event.evictedIds || []).forEach((id) => residency.set(id, 'absent'));
        (event.replacedIds || []).forEach((id) => residency.set(id, 'absent'));
      }
    }

    function validateReplacement(rows, replaceIds) {
      if (!replaceIds.length) return;
      const replaced = new Set(replaceIds);
      rows.forEach((row) => {
        if (row.parentRepresentationId !== null && !replaced.has(row.parentRepresentationId)) {
          throw spatialError('spatial_parent_replacement_undeclared', { representationId: row.id, parentRepresentationId: row.parentRepresentationId });
        }
      });
    }

    function requireRepresentation(id) {
      const row = representationById.get(id);
      if (!row) throw spatialError('spatial_representation_unknown', { representationId: id });
      return row;
    }

    function record(phase, detail) {
      events.push({ sequence: events.length + 1, phase, ...structuredClone(detail) });
    }

    return Object.freeze({ activeResource, evictRepresentation, pin, prefetch, requestRepresentations, seedRepresentations, snapshot, unpin });
  }

  function validateRepresentation(value, scopeById, priorRepresentations) {
    const keys = ['schema', 'id', 'scopeId', 'parentRepresentationId', 'fidelityLevelId', 'fidelityRank', 'url', 'sha256', 'cpuBytesEstimate', 'gpuBytesEstimate'];
    if (!value || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw spatialError('spatial_representation_keys_invalid', { representationId: value?.id || null });
    if (value.schema !== 'simulatte.recursiveRenderPayload/v1') throw spatialError('spatial_representation_schema_invalid', { representationId: value.id });
    if (!scopeById.has(value.scopeId)) throw spatialError('spatial_representation_scope_unknown', { representationId: value.id, scopeId: value.scopeId });
    if (priorRepresentations.has(value.id)) throw spatialError('spatial_representation_duplicate', { representationId: value.id });
    validateManifestEntry(value);
    if (value.parentRepresentationId !== null && typeof value.parentRepresentationId !== 'string') throw spatialError('spatial_parent_representation_invalid', { representationId: value.id });
    if (typeof value.fidelityLevelId !== 'string' || !value.fidelityLevelId) throw spatialError('spatial_fidelity_invalid', { representationId: value.id });
    if (!Number.isInteger(value.fidelityRank) || value.fidelityRank < 0) throw spatialError('spatial_fidelity_rank_invalid', { representationId: value.id });
    if (!Number.isInteger(value.cpuBytesEstimate) || value.cpuBytesEstimate < 0 || !Number.isInteger(value.gpuBytesEstimate) || value.gpuBytesEstimate < 0) throw spatialError('spatial_budget_estimate_invalid', { representationId: value.id });
  }

  function tileEntry(representation) {
    return { id: representation.id, url: representation.url, sha256: representation.sha256 };
  }

  function strongestResidency(states) {
    const order = ['absent', 'requested', 'staged', 'resident', 'pinned', 'evicting'];
    if (!states.length) return 'absent';
    return states.reduce((best, state) => order.indexOf(state) > order.indexOf(best) ? state : best, 'absent');
  }

  function spatialError(code, evidence = null) {
    const error = new Error(code);
    error.name = 'RecursiveSpatialResidencyError';
    error.code = code;
    error.evidence = evidence;
    return error;
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
    try {
      const loaded = await browserTransport.createBrowserTransport().readBytes(url, { signal });
      return loaded.bytes;
    } catch (error) {
      if (error.code === 'asset_fetch_failed') throw tileError('tile_fetch_failed', { url, status: error.evidence?.status || null });
      throw error;
    }
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

  return { createRecursiveSpatialResidencyManager, createWorldTileManager, defaultHashBytes, spatialError, tileError };
});
