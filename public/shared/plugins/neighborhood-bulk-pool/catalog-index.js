(function attachNeighborhoodBulkCatalogIndex(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkCatalogIndex = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkCatalogIndex() {
  const MAXIMUM_QUERY_TOKENS = 16;
  const MAXIMUM_RESULTS = 100;

  function createCatalogIndex(snapshot) {
    validateCatalogSnapshot(snapshot);
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
      const allowUnknownAvailability = options.allowUnknownAvailability === true;
      const limit = boundedInteger(options.limit, 1, MAXIMUM_RESULTS, 20);
      const candidateIndexes = new Set(tokens.flatMap((token) => postings.get(token) || []));
      const top = [];
      candidateIndexes.forEach((rowIndex) => {
        const item = snapshot.items[rowIndex];
        if (categoryIds.size && !categoryIds.has(item.categoryId)) return;
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

    return Object.freeze({
      coverage: Object.freeze({ ...snapshot.coverage }),
      itemCount: snapshot.items.length,
      offerCount: offersByItemWarehouse.size,
      requireItem,
      offer(itemId, warehouseId) {
        return offersByItemWarehouse.get(`${itemId}:${warehouseId}`) || null;
      },
      eligibleOffersFor,
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
    const categoryIds = uniqueIds(value.categories, 'catalog category');
    const itemIds = uniqueIds(value.items, 'catalog item');
    if (value.coverage.catalogRows !== value.items.length) {
      throw catalogError(
        'bulk_catalog_coverage_mismatch',
        `Catalog declares ${value.coverage.catalogRows} rows but contains ${value.items.length}`
      );
    }
    value.items.forEach((item) => {
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
    if (itemIds.size !== value.items.length) throw catalogError('bulk_catalog_item_duplicate', 'Catalog item IDs are not unique');
    return value;
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
    tokenize,
    validateCatalogSnapshot,
  });
});
