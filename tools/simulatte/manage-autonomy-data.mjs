#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const DEFAULT_CATALOG = path.join(TOOL_DIR, 'source-catalog-v1.json');
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'plan';
  const startIndex = command === 'plan' && argv[0]?.startsWith('--') ? 0 : 1;
  const options = {
    command,
    catalog: DEFAULT_CATALOG,
    groups: [],
    sources: [],
    snapshotDate: null,
    bounds: null,
    from: null,
    to: null,
    out: null,
    receipt: null,
    target: null,
    acceptReceiptSha: null,
    maxBytes: DEFAULT_MAX_BYTES,
  };
  for (let index = startIndex; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--catalog') options.catalog = path.resolve(value());
    else if (key === '--group') options.groups.push(...splitList(value()));
    else if (key === '--source') options.sources.push(...splitList(value()));
    else if (key === '--snapshot-date') options.snapshotDate = value();
    else if (key === '--bounds') options.bounds = parseBounds(value());
    else if (key === '--from') options.from = value();
    else if (key === '--to') options.to = value();
    else if (key === '--out') options.out = path.resolve(value());
    else if (key === '--receipt') options.receipt = path.resolve(value());
    else if (key === '--target') options.target = path.resolve(value());
    else if (key === '--accept-receipt-sha') options.acceptReceiptSha = value();
    else if (key === '--max-bytes') options.maxBytes = parsePositiveInteger(value(), key);
    else if (key === '--help') options.command = 'help';
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function usage() {
  return [
    'usage:',
    '  node tools/autonomy/manage-autonomy-data.mjs plan --group GROUP --snapshot-date YYYY-MM-DD',
    '  node tools/autonomy/manage-autonomy-data.mjs fetch --group GROUP --snapshot-date YYYY-MM-DD --out DIR',
    '  node tools/autonomy/manage-autonomy-data.mjs backfill --group GROUP --from YYYY-MM-DD --to YYYY-MM-DD --snapshot-date YYYY-MM-DD --out DIR',
    '  node tools/autonomy/manage-autonomy-data.mjs verify --receipt DIR/fetch-receipt.json',
    '  node tools/autonomy/manage-autonomy-data.mjs promote --receipt DIR/fetch-receipt.json --target DIR --accept-receipt-sha SHA256',
    '',
    'Groups: world-core, pedestrian-topology, place-semantics, mobility-history, taxi-history.',
    'Fetch and backfill only stage immutable source bytes. They never rebuild or activate the hosted world.',
  ].join('\n');
}

function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const bytes = fs.readFileSync(catalogPath);
  const value = JSON.parse(bytes.toString('utf8'));
  validateCatalog(value);
  return { value, path: catalogPath, sha256: sha256(bytes) };
}

function validateCatalog(catalog) {
  if (catalog?.schema !== 'simulatte.autonomySourceCatalog.v1') throw new Error('Invalid autonomy source catalog schema');
  if (!catalog.id || !Array.isArray(catalog.sources) || !catalog.sources.length) throw new Error('Source catalog requires an ID and sources');
  const ids = new Set();
  catalog.sources.forEach((source) => {
    if (!source.id || ids.has(source.id)) throw new Error(`Duplicate or missing source ID ${source.id || 'missing'}`);
    ids.add(source.id);
    ['dataClass', 'authority', 'license', 'transport', 'url', 'output', 'entryGate'].forEach((key) => {
      if (!source[key]) throw new Error(`Source ${source.id} requires ${key}`);
    });
    if (source.transport === 'mediawiki_json') {
      if (!Array.isArray(source.pages) || !source.pages.length) throw new Error(`MediaWiki source ${source.id} requires pages`);
      const documentIds = new Set();
      source.pages.forEach((page) => {
        if (!page.documentId || documentIds.has(page.documentId)) throw new Error(`MediaWiki source ${source.id} requires unique document IDs`);
        documentIds.add(page.documentId);
        if (!page.title || !Array.isArray(page.placeLabels) || !page.placeLabels.length) throw new Error(`MediaWiki page ${page.documentId} requires title and placeLabels`);
      });
    }
  });
  Object.entries(catalog.groups || {}).forEach(([group, sourceIds]) => {
    if (!Array.isArray(sourceIds) || !sourceIds.length) throw new Error(`Group ${group} requires source IDs`);
    sourceIds.forEach((id) => {
      if (!ids.has(id)) throw new Error(`Group ${group} references unknown source ${id}`);
    });
  });
  return catalog;
}

function buildDataPlan(catalogRow, options) {
  const snapshotDate = requireIsoDate(options.snapshotDate, '--snapshot-date');
  const bounds = options.bounds || catalogRow.value.defaultBounds;
  validateBounds(bounds);
  const sources = selectSources(catalogRow.value, options.groups, options.sources);
  const temporalSources = sources.filter((source) => source.transport.endsWith('_temporal'));
  const staticSources = sources.filter((source) => !source.transport.endsWith('_temporal'));
  const isBackfill = options.command === 'backfill' || options.command === 'plan' && Boolean(options.from || options.to);
  if (isBackfill && staticSources.length) {
    throw new Error(`Backfill accepts temporal sources only: ${staticSources.map((row) => row.id).join(', ')}`);
  }
  if (!isBackfill && temporalSources.length) {
    throw new Error(`Temporal sources require backfill: ${temporalSources.map((row) => row.id).join(', ')}`);
  }
  const periods = isBackfill ? monthlyPeriods(options.from, options.to) : [null];
  const requests = sources.flatMap((source) => requestsForSource(source, { bounds, periods }));
  const plan = {
    schema: 'simulatte.autonomyDataFetchPlan.v1',
    catalog: { id: catalogRow.value.id, sha256: catalogRow.sha256, path: relativeToRoot(catalogRow.path) },
    mode: isBackfill ? 'historical_backfill' : 'snapshot_refresh',
    snapshotDate,
    bounds,
    sourceIds: sources.map((source) => source.id),
    requests,
    claimBoundary: catalogRow.value.claimBoundary,
  };
  return { ...plan, planSha256: sha256(canonicalBytes(plan)) };
}

function selectSources(catalog, groups, sourceIds) {
  const selected = new Set(sourceIds);
  groups.forEach((group) => {
    const rows = catalog.groups?.[group];
    if (!rows) throw new Error(`Unknown source group ${group}`);
    rows.forEach((id) => selected.add(id));
  });
  if (!selected.size) throw new Error('Select at least one --group or --source');
  const rowsById = new Map(catalog.sources.map((source) => [source.id, source]));
  return [...selected].sort().map((id) => {
    const source = rowsById.get(id);
    if (!source) throw new Error(`Unknown source ${id}`);
    return source;
  });
}

function requestsForSource(source, { bounds, periods }) {
  if (source.transport === 'osm_bbox_grid') return osmGridRequests(source, bounds);
  if (source.transport === 'mediawiki_json') return mediaWikiRequests(source);
  return periods.map((period) => {
    const replacements = templateValues(bounds, period);
    const query = source.query ? fillTemplate(source.query, replacements) : null;
    const url = fillTemplate(source.url, replacements) + (query ? `?${query}` : '');
    return requestRow(source, url, fillTemplate(source.output, replacements), period?.id || null);
  });
}

function mediaWikiRequests(source) {
  return source.pages.map((page) => {
    const url = new URL(source.url);
    Object.entries({
      action: 'query',
      prop: 'extracts|revisions',
      explaintext: '1',
      exintro: '1',
      rvprop: 'ids|timestamp',
      titles: page.title,
      format: 'json',
      formatversion: '2',
      maxlag: '5',
      origin: '*',
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const output = fillTemplate(source.output, { documentId: page.documentId });
    return requestRow(source, url.toString(), output, null, null, {
      documentId: page.documentId,
      pageTitle: page.title,
      placeLabels: [...page.placeLabels],
    });
  });
}

function osmGridRequests(source, bounds) {
  const rows = source.grid?.rows || 1;
  const columns = source.grid?.columns || 1;
  const latitudeStep = (bounds.north - bounds.south) / rows;
  const longitudeStep = (bounds.east - bounds.west) / columns;
  const requests = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = {
        south: bounds.south + latitudeStep * row,
        north: bounds.south + latitudeStep * (row + 1),
        west: bounds.west + longitudeStep * column,
        east: bounds.west + longitudeStep * (column + 1),
      };
      const number = row * columns + column + 1;
      const suffix = String(number).padStart(2, '0');
      const url = `${source.url}?bbox=${tile.west},${tile.south},${tile.east},${tile.north}`;
      requests.push(requestRow(source, url, `osm-highways-tile-${suffix}.osm`, null, tile));
    }
  }
  return requests;
}

function requestRow(source, url, output, period, bounds = null, extension = null) {
  return {
    id: `${source.id}:${period || output}`,
    sourceId: source.id,
    group: source.group,
    dataClass: source.dataClass,
    authority: source.authority,
    license: source.license,
    transport: source.transport,
    url,
    output,
    period,
    bounds,
    capabilities: [...source.capabilities],
    entryGate: source.entryGate,
    ...(extension || {}),
  };
}

async function fetchDataPlan(plan, { outDir, fetchImpl = fetch, maxBytes = DEFAULT_MAX_BYTES, command = [] }) {
  if (!outDir) throw new Error('Fetch requires an output directory');
  if (fs.existsSync(path.join(outDir, 'fetch-receipt.json'))) throw new Error(`Output already has a receipt: ${outDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const request of plan.requests) {
    const response = await fetchImpl(request.url, { headers: { 'User-Agent': 'Simulatte-Autonomy-Data/1.0' } });
    if (!response?.ok) throw new Error(`Fetch ${request.id} failed with HTTP ${response?.status || 'unknown'}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`Fetch ${request.id} returned zero bytes`);
    if (bytes.length > maxBytes) throw new Error(`Fetch ${request.id} exceeded ${maxBytes} bytes`);
    validateFetchedBytes(request.output, bytes);
    const outputPath = safeOutputPath(outDir, request.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bytes);
    results.push({
      requestId: request.id,
      sourceId: request.sourceId,
      output: path.relative(outDir, outputPath),
      byteCount: bytes.length,
      sha256: sha256(bytes),
      contentType: response.headers?.get?.('content-type') || null,
      etag: response.headers?.get?.('etag') || null,
      lastModified: response.headers?.get?.('last-modified') || null,
    });
  }
  const receipt = {
    schema: 'simulatte.autonomyDataFetchReceipt.v1',
    plan,
    command,
    files: results,
    activation: 'staged_not_active',
    claimBoundary: 'Successful fetching proves byte capture and identity only. No fetched source is routable, simulated, or hosted until its compiler and entry gates pass.',
  };
  const receiptPath = path.join(outDir, 'fetch-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath, receiptSha256: sha256(fs.readFileSync(receiptPath)) };
}

function verifyFetchReceipt(receiptPath) {
  const receiptBytes = fs.readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  if (receipt?.schema !== 'simulatte.autonomyDataFetchReceipt.v1') throw new Error('Invalid data fetch receipt schema');
  const directory = path.dirname(receiptPath);
  receipt.files.forEach((row) => {
    const file = safeOutputPath(directory, row.output);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== row.byteCount) throw new Error(`Byte count drift for ${row.output}`);
    if (sha256(bytes) !== row.sha256) throw new Error(`SHA-256 drift for ${row.output}`);
    validateFetchedBytes(row.output, bytes);
  });
  return {
    schema: 'simulatte.autonomyDataVerification.v1',
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    fileCount: receipt.files.length,
    totalBytes: receipt.files.reduce((sum, row) => sum + row.byteCount, 0),
    status: 'verified',
  };
}

function promoteFetchReceipt(receiptPath, target, acceptedSha) {
  if (!target || !acceptedSha) throw new Error('Promote requires --target and --accept-receipt-sha');
  const verification = verifyFetchReceipt(receiptPath);
  if (verification.receiptSha256 !== acceptedSha) {
    throw new Error(`Receipt SHA-256 expected ${acceptedSha}, received ${verification.receiptSha256}`);
  }
  const allowedRoot = path.join(ROOT, 'tools/simulatte/data-sources');
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== allowedRoot && !resolvedTarget.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(`Promotion target must remain under ${allowedRoot}`);
  }
  if (fs.existsSync(resolvedTarget)) throw new Error(`Promotion target already exists: ${resolvedTarget}`);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  fs.mkdirSync(resolvedTarget, { recursive: true });
  receipt.files.forEach((row) => {
    const source = safeOutputPath(path.dirname(receiptPath), row.output);
    const destination = safeOutputPath(resolvedTarget, row.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  });
  fs.copyFileSync(receiptPath, path.join(resolvedTarget, 'snapshot-receipt.json'));
  return { ...verification, target: resolvedTarget, activation: 'frozen_source_promoted_not_hosted' };
}

function validateFetchedBytes(output, bytes) {
  if (/\.(?:json|geojson)$/i.test(output)) JSON.parse(bytes.toString('utf8'));
  if (/\.osm$/i.test(output) && !/^\s*<\?xml|^\s*<osm\b/.test(bytes.toString('utf8', 0, Math.min(bytes.length, 256)))) {
    throw new Error(`${output} expected OSM XML`);
  }
}

function monthlyPeriods(fromValue, toValue) {
  const from = new Date(`${requireIsoDate(fromValue, '--from')}T00:00:00.000Z`);
  const to = new Date(`${requireIsoDate(toValue, '--to')}T00:00:00.000Z`);
  if (from >= to) throw new Error('--to must be after --from');
  if (from.getUTCDate() !== 1 || to.getUTCDate() !== 1) throw new Error('Monthly backfill boundaries must be first-of-month dates');
  const rows = [];
  for (let cursor = from; cursor < to;) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    rows.push({
      id: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      start: isoDate(cursor),
      end: isoDate(next),
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
    });
    cursor = next;
  }
  return rows;
}

function templateValues(bounds, period) {
  return {
    north: bounds.north,
    south: bounds.south,
    east: bounds.east,
    west: bounds.west,
    period: period?.id,
    start: period ? `${period.start}T00:00:00.000` : null,
    end: period ? `${period.end}T00:00:00.000` : null,
    yy: period ? String(period.year).slice(-2) : null,
    monthNumber: period?.month,
  };
}

function fillTemplate(template, values) {
  return String(template).replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, key) => {
    if (values[key] === null || values[key] === undefined) throw new Error(`Template requires ${key}`);
    return String(values[key]);
  });
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(sortValue(value)));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function safeOutputPath(directory, relativePath) {
  const root = path.resolve(directory);
  const output = path.resolve(root, relativePath);
  if (output === root || !output.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe output path ${relativePath}`);
  return output;
}

function relativeToRoot(file) {
  const relative = path.relative(ROOT, file);
  return relative.startsWith('..') ? path.resolve(file) : relative;
}

function parseBounds(value) {
  const [south, west, north, east] = String(value).split(',').map(Number);
  const bounds = { south, west, north, east };
  validateBounds(bounds);
  return bounds;
}

function validateBounds(bounds) {
  if (!bounds || !['south', 'west', 'north', 'east'].every((key) => Number.isFinite(bounds[key]))) {
    throw new Error('Bounds require south,west,north,east finite numbers');
  }
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) throw new Error('Bounds must have positive width and height');
}

function requireIsoDate(value, key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error(`${key} requires YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || isoDate(date) !== value) throw new Error(`${key} is not a valid date`);
  return value;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function splitList(value) {
  return String(value).split(',').map((row) => row.trim()).filter(Boolean);
}

function parsePositiveInteger(value, key) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${key} requires a positive integer`);
  return number;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  if (options.command === 'verify') {
    if (!options.receipt) throw new Error('Verify requires --receipt');
    console.log(JSON.stringify(verifyFetchReceipt(options.receipt), null, 2));
    return;
  }
  if (options.command === 'promote') {
    if (!options.receipt) throw new Error('Promote requires --receipt');
    console.log(JSON.stringify(promoteFetchReceipt(options.receipt, options.target, options.acceptReceiptSha), null, 2));
    return;
  }
  if (!['plan', 'fetch', 'backfill'].includes(options.command)) throw new Error(`Unknown command ${options.command}`);
  const plan = buildDataPlan(loadCatalog(options.catalog), options);
  if (options.command === 'plan') {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const defaultOut = path.join(ROOT, 'artifacts/autonomy-data', `${options.command}-${plan.snapshotDate}-${plan.planSha256.slice(0, 12)}`);
  const result = await fetchDataPlan(plan, {
    outDir: options.out || defaultOut,
    maxBytes: options.maxBytes,
    command: ['node', 'tools/simulatte/manage-autonomy-data.mjs', ...argv],
  });
  console.log(`AUTONOMY-DATA-FETCH mode=${plan.mode} sources=${plan.sourceIds.length} files=${result.receipt.files.length} receiptSha256=${result.receiptSha256} path=${result.receiptPath}`);
}

const isEntryPoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) main().catch((error) => {
  console.error(`AUTONOMY-DATA-ERROR ${error.message}`);
  process.exitCode = 1;
});

export {
  buildDataPlan,
  fetchDataPlan,
  fillTemplate,
  loadCatalog,
  monthlyPeriods,
  parseArgs,
  promoteFetchReceipt,
  selectSources,
  sortValue,
  validateCatalog,
  verifyFetchReceipt,
};
