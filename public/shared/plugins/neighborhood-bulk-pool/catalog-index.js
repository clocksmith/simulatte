(function attachNeighborhoodBulkCatalogIndex(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkCatalogIndex = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkCatalogIndex() {
  const MAXIMUM_QUERY_TOKENS = 16;
  const MAXIMUM_RESULTS = 100;

  function createCatalogIndex(sourceSnapshot) {
    validateCatalogSnapshot(sourceSnapshot);
    const snapshot = materializeCatalogSnapshot(sourceSnapshot);
    const itemsById = new Map();
    const postings = new Map();
    const offersByItemWarehouse = new Map();
    snapshot.items.forEach((item, rowIndex) => {
      itemsById.set(item.id, item);
      termsFor(item).forEach((term) => {
        const rows = postings.get(term) || [];
        rows.push(rowIndex);
        postings.set(term, rows);
      });
      item.offers.forEach((offer) => {
        offersByItemWarehouse.set(`${item.id}:${offer.warehouseId}`, offer);
      });
    });

    function search(query, options = {}) {
      const tokens = tokenize(query).slice(0, MAXIMUM_QUERY_TOKENS);
      if (!tokens.length) return Object.freeze([]);
      const warehouseIds = new Set(options.warehouseIds || []);
      const categoryIds = new Set(options.categoryIds || []);
      const temperatureZones = new Set(options.temperatureZones || []);
      const allowUnknownAvailability = options.allowUnknownAvailability === true;
      const limit = boundedInteger(options.limit, 1, MAXIMUM_RESULTS, 20);
      const candidateIndexes = new Set(tokens.flatMap((token) => postings.get(token) || []));
      const top = [];
      candidateIndexes.forEach((rowIndex) => {
        const item = snapshot.items[rowIndex];
        if (categoryIds.size && !categoryIds.has(item.categoryId)) return;
        if (temperatureZones.size && !temperatureZones.has(item.handling?.temperatureZone)) return;
        const offers = eligibleOffers(item, { warehouseIds, allowUnknownAvailability });
        if (!offers.length) return;
        const itemTerms = termsFor(item);
        const score = tokens.reduce((total, token) => (
          total + (itemTerms.has(token) ? 4 : 0) + (item.name.toLowerCase().includes(token) ? 2 : 0)
        ), 0);
        insertBounded(top, Object.freeze({
          itemId: item.id,
          itemNumber: item.itemNumber,
          name: item.name,
          categoryId: item.categoryId,
          temperatureZone: item.handling?.temperatureZone || 'ambient',
          package: Object.freeze({ ...item.package }),
          score,
          offers: Object.freeze(offers),
        }), limit);
      });
      return Object.freeze(top);
    }

    function eligibleOffersFor(itemId, options = {}) {
      const item = requireItem(itemId);
      return Object.freeze(eligibleOffers(item, {
        warehouseIds: new Set(options.warehouseIds || []),
        allowUnknownAvailability: options.allowUnknownAvailability === true,
      }));
    }

    function requireItem(itemId) {
      const item = itemsById.get(itemId);
      if (!item) throw catalogError('bulk_catalog_item_unknown', `Unknown catalog item ${itemId}`);
      return item;
    }

    function calculateFractionalShare(itemId, requestedUnits) {
      const item = requireItem(itemId);
      const innerUnits = item.package.innerUnits;
      const units = Number(requestedUnits);
      if (!Number.isFinite(units) || units <= 0) {
        throw catalogError(
          'bulk_catalog_share_units_invalid',
          `Requested units for ${itemId} must be a finite positive number`
        );
      }
      const packagesRequired = Math.ceil(units / innerUnits);
      const purchasedUnits = packagesRequired * innerUnits;
      return Object.freeze({
        itemId: item.id,
        requestedUnits: units,
        innerUnits,
        packagesRequired,
        purchasedUnits,
        unallocatedUnits: Number((purchasedUnits - units).toFixed(4)),
        shareFraction: Number((units / purchasedUnits).toFixed(4)),
        isFractional: units % innerUnits !== 0,
        massKg: Number((item.package.massKg * units / innerUnits).toFixed(3)),
        volumeL: Number((item.package.volumeL * units / innerUnits).toFixed(3)),
      });
    }

    return Object.freeze({
      coverage: Object.freeze({ ...snapshot.coverage }),
      itemCount: snapshot.items.length,
      offerCount: offersByItemWarehouse.size,
      requireItem,
      offer(itemId, warehouseId) {
        return offersByItemWarehouse.get(`${itemId}:${warehouseId}`) || null;
      },
      eligibleOffersFor,
      calculateFractionalShare,
      search,
    });
  }

  function validateCatalogSnapshot(value) {
    if (!value || value.schema !== 'simulatte.neighborhoodBulkCatalogSnapshot.v1'
      || typeof value.id !== 'string' || !value.id
      || !value.coverage || !Array.isArray(value.categories)
      || !Array.isArray(value.items) || !value.items.length) {
      throw catalogError('bulk_catalog_invalid', 'Catalog snapshot header is incomplete');
    }
    const snapshot = materializeCatalogSnapshot(value);
    const categoryIds = uniqueIds(snapshot.categories, 'catalog category');
    const itemIds = uniqueIds(snapshot.items, 'catalog item');
    if (snapshot.coverage.catalogRows !== snapshot.items.length) {
      throw catalogError(
        'bulk_catalog_coverage_mismatch',
        `Catalog declares ${snapshot.coverage.catalogRows} rows but materializes ${snapshot.items.length}`
      );
    }
    snapshot.items.forEach((item) => {
      if (!categoryIds.has(item.categoryId)
        || typeof item.name !== 'string' || !item.name
        || typeof item.itemNumber !== 'string' || !item.itemNumber
        || !item.package || !Number.isInteger(item.package.innerUnits) || item.package.innerUnits < 1
        || !Number.isFinite(item.package.massKg) || item.package.massKg < 0
        || !Number.isFinite(item.package.volumeL) || item.package.volumeL < 0
        || !item.handling || !['ambient', 'refrigerated', 'frozen'].includes(item.handling.temperatureZone)
        || !item.eligibility || typeof item.eligibility.isPoolEligible !== 'boolean'
        || !Array.isArray(item.offers) || !item.offers.length) {
        throw catalogError('bulk_catalog_item_invalid', `Catalog item ${item.id || 'missing'} is incomplete`);
      }
      const warehouseIds = new Set();
      item.offers.forEach((offer) => {
        if (warehouseIds.has(offer.warehouseId)
          || !Number.isFinite(offer.priceUsd) || offer.priceUsd < 0
          || !['observed-in-stock', 'scenario-available', 'unknown', 'unavailable'].includes(offer.availability)) {
          throw catalogError('bulk_catalog_offer_invalid', `Catalog item ${item.id} has an invalid warehouse offer`);
        }
        warehouseIds.add(offer.warehouseId);
      });
    });
    if (itemIds.size !== snapshot.items.length) throw catalogError('bulk_catalog_item_duplicate', 'Catalog item IDs are not unique');
    return value;
  }

  function materializeCatalogSnapshot(snapshot) {
    const expansion = snapshot?.modeledExpansion;
    if (!expansion || snapshot.items.length === snapshot.coverage.catalogRows) return snapshot;
    if (!Number.isInteger(expansion.targetRows)
      || expansion.targetRows < snapshot.items.length
      || expansion.targetRows > snapshot.coverage.maximumSupportedRows
      || !Array.isArray(expansion.descriptors) || !expansion.descriptors.length
      || !Array.isArray(expansion.archetypes) || !expansion.archetypes.length) {
      throw catalogError('bulk_catalog_expansion_invalid', 'Modeled catalog expansion is incomplete or outside the supported row bound');
    }
    const categories = new Set(snapshot.categories.map((row) => row.id));
    const warehouseIds = [...new Set(snapshot.items.flatMap((item) => (
      item.offers.map((offer) => offer.warehouseId)
    )))].sort();
    const generated = [];
    const generatedCount = expansion.targetRows - snapshot.items.length;
    for (let index = 0; index < generatedCount; index += 1) {
      const archetype = expansion.archetypes[index % expansion.archetypes.length];
      if (!categories.has(archetype.categoryId)) {
        throw catalogError('bulk_catalog_expansion_category_invalid', `Unknown modeled category ${archetype.categoryId}`);
      }
      const descriptor = expansion.descriptors[
        Math.floor(index / expansion.archetypes.length) % expansion.descriptors.length
      ];
      const packVariant = 1 + (Math.floor(index / (
        expansion.archetypes.length * expansion.descriptors.length
      )) % 9);
      const innerUnits = Math.max(1, archetype.innerUnits + packVariant - 1);
      const priceUsd = archetype.basePriceUsd * (0.82 + (packVariant * 0.045));
      generated.push({
        id: `modeled-catalog-${String(index + 1).padStart(5, '0')}`,
        itemNumber: `MODELED-${String(index + 1).padStart(6, '0')}`,
        name: `${descriptor} ${archetype.name}, pack ${innerUnits}`,
        brand: null,
        categoryId: archetype.categoryId,
        categoryPath: [...archetype.categoryPath],
        package: {
          innerUnits,
          unitType: archetype.unitType,
          divisionMode: archetype.divisionMode,
          massKg: rounded(archetype.massKg * (innerUnits / archetype.innerUnits)),
          volumeL: rounded(archetype.volumeL * (innerUnits / archetype.innerUnits)),
        },
        handling: {
          temperatureZone: archetype.temperatureZone,
          maximumTransitMinutes: archetype.maximumTransitMinutes,
        },
        eligibility: {
          isPoolEligible: true,
          requiresSealedInnerUnit: archetype.divisionMode === 'sealed-unit',
          isRestricted: false,
        },
        offers: warehouseIds.map((warehouseId, warehouseIndex) => ({
          warehouseId,
          priceUsd: rounded(priceUsd + (warehouseIndex * 0.37)),
          availability: 'scenario-available',
        })),
        truth: snapshot.truth,
      });
    }
    return Object.freeze({
      ...snapshot,
      items: Object.freeze([...snapshot.items, ...generated]),
      coverage: Object.freeze({
        ...snapshot.coverage,
        catalogRows: expansion.targetRows,
      }),
    });
  }

  function rounded(value) {
    return Number(value.toFixed(2));
  }

  function eligibleOffers(item, { warehouseIds, allowUnknownAvailability }) {
    if (!item.eligibility.isPoolEligible || item.eligibility.isRestricted) return [];
    return item.offers
      .filter((offer) => !warehouseIds.size || warehouseIds.has(offer.warehouseId))
      .filter((offer) => ['observed-in-stock', 'scenario-available'].includes(offer.availability)
        || (allowUnknownAvailability && offer.availability === 'unknown'))
      .map((offer) => Object.freeze({ ...offer }))
      .sort((left, right) => left.priceUsd - right.priceUsd || left.warehouseId.localeCompare(right.warehouseId));
  }

  function termsFor(item) {
    return new Set(tokenize([
      item.itemNumber,
      item.name,
      item.brand || '',
      item.categoryId,
      ...(item.categoryPath || []),
    ].join(' ')));
  }

  function tokenize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function insertBounded(rows, value, limit) {
    let index = rows.findIndex((row) => (
      value.score > row.score || (value.score === row.score && value.itemId.localeCompare(row.itemId) < 0)
    ));
    if (index < 0) index = rows.length;
    rows.splice(index, 0, value);
    if (rows.length > limit) rows.pop();
  }

  function uniqueIds(rows, label) {
    const ids = new Set();
    rows.forEach((row) => {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
        throw catalogError('bulk_catalog_identity_invalid', `${label} IDs must be unique non-empty strings`);
      }
      ids.add(row.id);
    });
    return ids;
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    const selected = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
      throw catalogError('bulk_catalog_limit_invalid', `Catalog result limit must be from ${minimum} to ${maximum}`);
    }
    return selected;
  }

  function catalogError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNeighborhoodBulkCatalogError';
    error.code = code;
    return error;
  }

  return Object.freeze({
    MAXIMUM_QUERY_TOKENS,
    MAXIMUM_RESULTS,
    createCatalogIndex,
    materializeCatalogSnapshot,
    tokenize,
    validateCatalogSnapshot,
  });
});
