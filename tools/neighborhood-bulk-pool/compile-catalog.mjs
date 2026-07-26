#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_WAREHOUSE_REGISTRY = path.join(
  ROOT,
  'public/data/neighborhood-bulk-pool/warehouse-registry-v1.json'
);
const MAXIMUM_CATALOG_ROWS = 250000;
const SOURCE_KINDS = new Set([
  'authorized-warehouse-feed',
  'consented-app-observation',
  'member-receipt-observation',
  'same-day-eligible-subset',
  'modeled-scenario',
]);
const AVAILABILITY_VALUES = new Set([
  'observed-in-stock',
  'scenario-available',
  'unknown',
  'unavailable',
]);

export function compileCatalog({ sourceBytes, receiptBytes, warehouseRegistry }) {
  const source = parseJson(sourceBytes, 'catalog source');
  const sourceReceipt = parseJson(receiptBytes, 'catalog source receipt');
  validateReceipt(sourceReceipt, sourceBytes);
  validateSource(source, sourceReceipt, warehouseRegistry);
  const truth = truthFor(sourceReceipt.sourceKind);
  const declaredComplete = sourceReceipt.sourceKind === 'authorized-warehouse-feed'
    && source.declaredComplete === true;
  const items = source.items.map((item) => normalizeItem(item, truth))
    .sort((left, right) => left.id.localeCompare(right.id));
  const snapshot = {
    schema: 'simulatte.neighborhoodBulkCatalogSnapshot.v1',
    id: source.snapshotId,
    contentVersion: source.contentVersion,
    coverage: {
      status: declaredComplete ? 'authorized-snapshot' : coverageStatus(sourceReceipt.sourceKind),
      catalogRows: items.length,
      declaredComplete,
      maximumSupportedRows: MAXIMUM_CATALOG_ROWS,
      missingCapabilities: missingCapabilities(sourceReceipt.sourceKind, declaredComplete),
    },
    categories: source.categories.map((row) => ({
      id: row.id,
      label: row.label,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    items,
    source: {
      sourceId: sourceReceipt.sourceId,
      sourceKind: sourceReceipt.sourceKind,
      authority: sourceReceipt.authority,
      retrievedAt: sourceReceipt.retrievedAt,
      sourceSha256: sourceReceipt.sourceSha256,
      authorizationReference: sourceReceipt.authorizationReference || null,
      consentPolicyId: sourceReceipt.consentPolicyId || null,
      warehouseIds: [...new Set(items.flatMap((item) => (
        item.offers.map((offer) => offer.warehouseId)
      )))].sort(),
    },
    truth,
    claimBoundary: claimBoundary(sourceReceipt.sourceKind, declaredComplete),
  };
  return deepFreeze(snapshot);
}

export function buildCompileReceipt({ catalogBytes, sourceBytes, receiptBytes, catalog }) {
  return deepFreeze({
    schema: 'simulatte.neighborhoodBulkCatalogCompileReceipt.v1',
    catalogId: catalog.id,
    contentVersion: catalog.contentVersion,
    catalogRows: catalog.items.length,
    warehouseIds: catalog.source.warehouseIds,
    sourceKind: catalog.source.sourceKind,
    sourceSha256: sha256(sourceBytes),
    sourceReceiptSha256: sha256(receiptBytes),
    outputSha256: sha256(catalogBytes),
    catalogDeclaredComplete: catalog.coverage.declaredComplete,
    compiler: 'tools/neighborhood-bulk-pool/compile-catalog.mjs',
    claimBoundary: catalog.claimBoundary,
  });
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function validateReceipt(receipt, sourceBytes) {
  if (receipt?.schema !== 'simulatte.neighborhoodBulkCatalogSourceReceipt.v1'
    || typeof receipt.sourceId !== 'string' || !receipt.sourceId
    || !SOURCE_KINDS.has(receipt.sourceKind)
    || typeof receipt.authority !== 'string' || !receipt.authority
    || !validIsoDate(receipt.retrievedAt)
    || receipt.sourceSha256 !== sha256(sourceBytes)) {
    throw catalogCompileError(
      'bulk_catalog_source_receipt_invalid',
      'Source receipt identity, authority, time, kind, or SHA-256 does not match the source bytes'
    );
  }
  if (receipt.sourceKind === 'authorized-warehouse-feed'
    && (typeof receipt.authorizationReference !== 'string' || !receipt.authorizationReference)) {
    throw catalogCompileError(
      'bulk_catalog_authorization_missing',
      'Authorized warehouse feeds require an authorizationReference'
    );
  }
  if (receipt.sourceKind === 'consented-app-observation'
    && (typeof receipt.consentPolicyId !== 'string' || !receipt.consentPolicyId)) {
    throw catalogCompileError(
      'bulk_catalog_consent_missing',
      'Consented app observations require a consentPolicyId'
    );
  }
}

function validateSource(source, receipt, warehouseRegistry) {
  if (source?.schema !== 'simulatte.neighborhoodBulkCatalogFeed.v1'
    || typeof source.snapshotId !== 'string' || !source.snapshotId
    || typeof source.contentVersion !== 'string' || !source.contentVersion
    || !Array.isArray(source.categories) || !source.categories.length
    || !Array.isArray(source.items) || !source.items.length
    || source.items.length > MAXIMUM_CATALOG_ROWS) {
    throw catalogCompileError(
      'bulk_catalog_feed_invalid',
      `Catalog feeds require 1-${MAXIMUM_CATALOG_ROWS} normalized rows`
    );
  }
  uniqueIds(source.categories, 'category');
  const categoryIds = new Set(source.categories.map((row) => row.id));
  const warehouseIds = new Set(warehouseRegistry?.warehouses?.map((row) => row.id) || []);
  if (!warehouseIds.size) {
    throw catalogCompileError('bulk_catalog_warehouse_registry_invalid', 'Warehouse registry is missing');
  }
  uniqueIds(source.items, 'item');
  source.items.forEach((item) => validateItem(item, categoryIds, warehouseIds, receipt.sourceKind));
}

function validateItem(item, categoryIds, warehouseIds, sourceKind) {
  if (!categoryIds.has(item.categoryId)
    || typeof item.itemNumber !== 'string' || !item.itemNumber
    || typeof item.name !== 'string' || !item.name
    || !item.package || !Number.isInteger(item.package.innerUnits) || item.package.innerUnits < 1
    || !Number.isFinite(item.package.massKg) || item.package.massKg < 0
    || !Number.isFinite(item.package.volumeL) || item.package.volumeL < 0
    || !item.handling || !['ambient', 'refrigerated', 'frozen'].includes(item.handling.temperatureZone)
    || !Number.isFinite(item.handling.maximumTransitMinutes)
    || item.handling.maximumTransitMinutes <= 0
    || !item.eligibility || typeof item.eligibility.isPoolEligible !== 'boolean'
    || typeof item.eligibility.isRestricted !== 'boolean'
    || !Array.isArray(item.offers) || !item.offers.length) {
    throw catalogCompileError('bulk_catalog_feed_item_invalid', `Catalog item ${item.id || 'missing'} is incomplete`);
  }
  const offeredWarehouses = new Set();
  item.offers.forEach((offer) => {
    if (!warehouseIds.has(offer.warehouseId)
      || offeredWarehouses.has(offer.warehouseId)
      || !Number.isFinite(offer.priceUsd) || offer.priceUsd < 0
      || !AVAILABILITY_VALUES.has(offer.availability)) {
      throw catalogCompileError(
        'bulk_catalog_feed_offer_invalid',
        `Catalog item ${item.id} has an invalid or duplicate warehouse offer`
      );
    }
    if (sourceKind !== 'modeled-scenario' && offer.availability === 'scenario-available') {
      throw catalogCompileError(
        'bulk_catalog_observation_truth_invalid',
        `Observed source ${sourceKind} cannot emit scenario-available inventory`
      );
    }
    offeredWarehouses.add(offer.warehouseId);
  });
}

function normalizeItem(item, truth) {
  return {
    id: item.id,
    itemNumber: item.itemNumber,
    name: item.name,
    brand: item.brand || null,
    categoryId: item.categoryId,
    categoryPath: Array.isArray(item.categoryPath) ? [...item.categoryPath] : [],
    package: { ...item.package },
    handling: { ...item.handling },
    eligibility: { ...item.eligibility },
    offers: item.offers.map((offer) => ({
      warehouseId: offer.warehouseId,
      priceUsd: offer.priceUsd,
      availability: offer.availability,
      observedAt: offer.observedAt || null,
      truth,
    })).sort((left, right) => left.warehouseId.localeCompare(right.warehouseId)),
    truth,
  };
}

function truthFor(sourceKind) {
  if (sourceKind === 'modeled-scenario') {
    return {
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { reason: 'Catalog rows were authored for simulation and are not warehouse observations.' },
      },
    };
  }
  return {
    origin: 'observed',
    temporalStatus: 'snapshot',
    uncertainty: {
      kind: 'missing',
      value: {
        reason: sourceKind === 'same-day-eligible-subset'
          ? 'Same-Day eligibility does not establish complete warehouse inventory or warehouse price.'
          : 'Warehouse availability may change after the governed observation time.',
      },
    },
  };
}

function coverageStatus(sourceKind) {
  return {
    'authorized-warehouse-feed': 'authorized-partial-snapshot',
    'consented-app-observation': 'consented-observation-subset',
    'member-receipt-observation': 'receipt-observation-subset',
    'same-day-eligible-subset': 'same-day-eligible-subset',
    'modeled-scenario': 'modeled-scenario',
  }[sourceKind];
}

function missingCapabilities(sourceKind, declaredComplete) {
  if (declaredComplete) return ['live availability after snapshot time', 'receipt-confirmed final purchase prices'];
  const rows = ['complete warehouse-specific item coverage', 'live availability after snapshot time'];
  if (sourceKind === 'same-day-eligible-subset') rows.push('warehouse price parity');
  if (sourceKind !== 'member-receipt-observation') rows.push('receipt-confirmed final purchase prices');
  return rows;
}

function claimBoundary(sourceKind, declaredComplete) {
  if (declaredComplete) {
    return 'This is a governed, authorized warehouse catalog snapshot. Completeness applies only to its declared warehouses and retrieval time; it is not live inventory and final settlement still requires the purchase receipt.';
  }
  return `This ${coverageStatus(sourceKind)} is not a complete Costco warehouse catalog or live inventory claim. Missing products and changed prices or availability must remain unsupported.`;
}

function uniqueIds(rows, label) {
  const ids = new Set();
  rows.forEach((row) => {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw catalogCompileError(
        'bulk_catalog_feed_identity_invalid',
        `${label} IDs must be unique non-empty strings`
      );
    }
    ids.add(row.id);
  });
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw catalogCompileError('bulk_catalog_source_json_invalid', `${label} is not valid JSON`);
  }
}

function validIsoDate(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && value.includes('T');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) return value;
  seen.add(value);
  Object.values(value).forEach((row) => deepFreeze(row, seen));
  return Object.freeze(value);
}

function catalogCompileError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.name = 'SimulatteNeighborhoodBulkCatalogCompileError';
  error.code = code;
  return error;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw catalogCompileError('bulk_catalog_arguments_invalid', 'Every CLI option requires a value');
    }
    options[key.slice(2)] = path.resolve(value);
  }
  for (const key of ['source', 'source-receipt', 'output', 'compile-receipt']) {
    if (!options[key]) {
      throw catalogCompileError('bulk_catalog_arguments_invalid', `Missing --${key}`);
    }
  }
  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const sourceBytes = fs.readFileSync(options.source);
  const receiptBytes = fs.readFileSync(options['source-receipt']);
  const warehouseRegistry = JSON.parse(fs.readFileSync(
    options['warehouse-registry'] || DEFAULT_WAREHOUSE_REGISTRY,
    'utf8'
  ));
  const catalog = compileCatalog({ sourceBytes, receiptBytes, warehouseRegistry });
  const catalogBytes = Buffer.from(canonicalJson(catalog));
  const compileReceipt = buildCompileReceipt({
    catalogBytes,
    sourceBytes,
    receiptBytes,
    catalog,
  });
  fs.writeFileSync(options.output, catalogBytes);
  fs.writeFileSync(options['compile-receipt'], canonicalJson(compileReceipt));
  process.stdout.write(
    `NEIGHBORHOOD-BULK-CATALOG status=written rows=${catalog.items.length} warehouses=${catalog.source.warehouseIds.length} sha256=${compileReceipt.outputSha256}\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
