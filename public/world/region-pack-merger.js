(function attachAutonomyRegionPacks(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRegionPacks = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRegionPackMerger() {
  class RegionPackMergeError extends Error {
    constructor(code, message, evidence) {
      super(`${code}: ${message}`);
      this.name = 'RegionPackMergeError';
      this.code = code;
      this.evidence = evidence;
    }
  }

  function mergeRegionPacks(registry, packs) {
    const expectedIds = registry.composition.defaultPackIds;
    assertExactIdentities(expectedIds, packs.map((pack) => pack.id), 'region_pack_set_mismatch');
    const packById = new Map(packs.map((pack) => [pack.id, pack]));
    const ordered = expectedIds.map((id) => packById.get(id));
    const nodeMerge = mergeRows('nodes', ordered, registry.sharedWorldRows.nodes || []);
    const segmentMerge = mergeRows('segments', ordered, registry.sharedWorldRows.segments || []);
    const signalMerge = mergeRows('signals', ordered, registry.sharedWorldRows.signals || []);
    const actorMerge = mergeRows('actors', ordered, registry.sharedWorldRows.actors || []);
    const disruptionMerge = mergeRows('disruptions', ordered, registry.sharedWorldRows.disruptions || []);
    const landMerge = mergeRenderRows('land', ordered, registry.sharedWorldRows.renderGeometry.land || []);
    const streetMerge = mergeRenderRows('streets', ordered, registry.sharedWorldRows.renderGeometry.streets || []);
    const buildingMerge = mergeRenderRows('buildings', ordered, registry.sharedWorldRows.renderGeometry.buildings || []);
    const facilityMerge = mergeRenderRows('bikeFacilities', ordered, registry.sharedWorldRows.renderGeometry.bikeFacilities || []);
    const cardMerge = mergeRows('featureCards', ordered, registry.sharedFeatureRows.cards || []);
    const world = {
      ...structuredClone(registry.worldTemplate),
      nodes: nodeMerge.rows,
      segments: segmentMerge.rows,
      signals: signalMerge.rows,
      actors: actorMerge.rows,
      disruptions: disruptionMerge.rows,
      renderGeometry: {
        ...structuredClone(registry.worldTemplate.renderGeometry),
        land: landMerge.rows,
        streets: streetMerge.rows,
        buildings: buildingMerge.rows,
        bikeFacilities: facilityMerge.rows,
      },
    };
    const featureCatalog = {
      ...structuredClone(registry.featureCatalogTemplate),
      cards: cardMerge.rows,
      index: mergeFeatureIndexes(registry, ordered, cardMerge.rows),
    };
    const actualSeamNodeIds = nodeMerge.duplicateIds;
    assertExactIdentities(registry.composition.seamNodeIds, actualSeamNodeIds, 'region_seam_set_mismatch');
    validatePackSeams(ordered);
    assertCounts(registry.composition.expectedCounts, { world, featureCatalog });
    return {
      world,
      featureCatalog,
      receipt: {
        schema: 'simulatte.autonomyRegionCompositionReceipt.v1',
        id: registry.composition.id,
        registryId: registry.id,
        cityId: registry.city.id,
        packIds: [...expectedIds],
        seamNodeIds: [...actualSeamNodeIds],
        duplicateNodeCount: actualSeamNodeIds.length,
        mergePolicy: structuredClone(registry.mergePolicy),
        expectedWorldSha256: registry.composition.worldSha256,
        expectedFeatureCatalogSha256: registry.composition.featureCatalogSha256,
      },
    };
  }

  function validatePackSeams(packs) {
    const memberships = new Map();
    packs.forEach((pack) => pack.nodes.forEach((node) => {
      if (!memberships.has(node.id)) memberships.set(node.id, []);
      memberships.get(node.id).push(pack.id);
    }));
    memberships.forEach((packIds) => packIds.sort());
    packs.forEach((pack) => {
      const expectedNodeIds = pack.nodes
        .filter((node) => (memberships.get(node.id) || []).length > 1)
        .map((node) => node.id);
      const declaredNodeIds = pack.seams.map((seam) => seam.nodeId);
      assertExactIdentities(expectedNodeIds, declaredNodeIds, 'region_pack_seam_set_mismatch');
      pack.seams.forEach((seam) => {
        const expectedPeerIds = memberships.get(seam.nodeId).filter((id) => id !== pack.id);
        assertExactIdentities(expectedPeerIds, seam.peerPackIds, 'region_pack_seam_peer_mismatch');
      });
    });
  }

  function mergeRows(collection, packs, sharedRows) {
    const rows = [...sharedRows];
    packs.forEach((pack) => rows.push(...(pack[collection] || [])));
    return deduplicateRows(collection, rows);
  }

  function mergeRenderRows(collection, packs, sharedRows) {
    const rows = [...sharedRows];
    packs.forEach((pack) => rows.push(...(pack.renderGeometry[collection] || [])));
    return deduplicateRows(`renderGeometry.${collection}`, rows);
  }

  function deduplicateRows(collection, rows) {
    const byId = new Map();
    const duplicateIds = new Set();
    rows.forEach((row) => {
      const prior = byId.get(row.id);
      if (!prior) {
        byId.set(row.id, { row: structuredClone(row), canonical: canonicalJson(row) });
        return;
      }
      const canonical = canonicalJson(row);
      if (canonical !== prior.canonical) {
        throw new RegionPackMergeError('region_row_conflict', `${collection} ID ${row.id} differs across packs`, {
          collection,
          rowId: row.id,
          expectedCanonical: prior.canonical,
          receivedCanonical: canonical,
        });
      }
      duplicateIds.add(row.id);
    });
    return {
      rows: [...byId.values()].map((entry) => entry.row).sort(byIdAscending),
      duplicateIds: [...duplicateIds].sort(),
    };
  }

  function mergeFeatureIndexes(registry, packs, cards) {
    const tokenToCardIds = mergeIndexMap('tokenToCardIds', registry.sharedFeatureRows.index, packs);
    const kindToCardIds = mergeIndexMap('kindToCardIds', registry.sharedFeatureRows.index, packs);
    const knownCardIds = new Set(cards.map((row) => row.id));
    for (const [mapName, rows] of Object.entries({ tokenToCardIds, kindToCardIds })) {
      Object.entries(rows).forEach(([key, ids]) => ids.forEach((id) => {
        if (!knownCardIds.has(id)) throw new RegionPackMergeError('region_index_unknown_card', `${mapName}.${key} references ${id}`, { mapName, key, cardId: id });
      }));
    }
    return {
      ...structuredClone(registry.featureCatalogTemplate.index),
      cardCount: cards.length,
      tokenToCardIds,
      kindToCardIds,
    };
  }

  function mergeIndexMap(mapName, sharedIndex, packs) {
    const values = new Map();
    const sources = [sharedIndex, ...packs.map((pack) => pack.featureIndex)];
    sources.forEach((source) => Object.entries(source[mapName] || {}).forEach(([key, ids]) => {
      if (!values.has(key)) values.set(key, new Set());
      ids.forEach((id) => values.get(key).add(id));
    }));
    return Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([key, ids]) => [key, [...ids].sort()]));
  }

  function assertCounts(expected, { world, featureCatalog }) {
    const actual = {
      nodes: world.nodes.length,
      segments: world.segments.length,
      signals: world.signals.length,
      actors: world.actors.length,
      disruptions: world.disruptions.length,
      land: world.renderGeometry.land.length,
      streets: world.renderGeometry.streets.length,
      buildings: world.renderGeometry.buildings.length,
      bikeFacilities: world.renderGeometry.bikeFacilities.length,
      featureCards: featureCatalog.cards.length,
    };
    Object.entries(expected).forEach(([key, value]) => {
      if (actual[key] !== value) throw new RegionPackMergeError('region_composition_count_mismatch', `${key} expected ${value}, received ${actual[key]}`, { key, expected: value, actual: actual[key] });
    });
  }

  function assertExactIdentities(expected, actual, code) {
    const left = [...expected].sort();
    const right = [...actual].sort();
    if (left.length !== right.length || left.some((id, index) => id !== right[index])) {
      throw new RegionPackMergeError(code, `expected [${left.join(', ')}], received [${right.join(', ')}]`, { expected: left, actual: right });
    }
  }

  function canonicalJson(value) {
    return JSON.stringify(sortValue(value));
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }

  function byIdAscending(left, right) {
    return left.id.localeCompare(right.id);
  }

  return { RegionPackMergeError, canonicalJson, mergeRegionPacks, sortValue };
});
