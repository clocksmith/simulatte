#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, 'public/data/orbital-transfer-planner');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'jpl-horizons-heliocentric-vectors-v1.json');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'dataset-manifest.json');

const options = parseArgs(process.argv.slice(2));
const BODY_METADATA = Object.freeze({
  sun:     { command: '10',  name: 'Sun',     color: '#ffaa33', radiusAu: 0.00465047, periodDays: null },
  mercury: { command: '199', name: 'Mercury', color: '#aaaaaa', radiusAu: 0.00001631, periodDays: 87.9691 },
  venus:   { command: '299', name: 'Venus',   color: '#eebb88', radiusAu: 0.00004045, periodDays: 224.701 },
  earth:   { command: '399', name: 'Earth',   color: '#44aaff', radiusAu: 0.00004264, periodDays: 365.256 },
  moon:    { command: '301', name: 'Moon',    color: '#888888', radiusAu: 0.00001161, periodDays: 27.3217 },
  mars:    { command: '499', name: 'Mars',    color: '#ff5533', radiusAu: 0.00002266, periodDays: 686.98 },
  jupiter: { command: '599', name: 'Jupiter', color: '#eeddaa', radiusAu: 0.00047789, periodDays: 4332.59 },
  saturn:  { command: '699', name: 'Saturn',  color: '#eacc99', radiusAu: 0.00040287, periodDays: 10759.22 },
  uranus:  { command: '799', name: 'Uranus',  color: '#aaddff', radiusAu: 0.00017085, periodDays: 30685.4 },
  neptune: { command: '899', name: 'Neptune', color: '#5588ff', radiusAu: 0.00016554, periodDays: 60189.0 },
});

await main();

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const retrievedAt = new Date().toISOString();
  const bodies = {};

  for (const [id, metadata] of Object.entries(BODY_METADATA)) {
    process.stdout.write(`JPL-HORIZONS body=${id} status=fetching\n`);
    const url = horizonsUrl(metadata.command, options);
    const payload = await fetchJsonWithRetry(url, {
      attempts: options.attempts,
      timeoutMs: options.timeoutMs,
    });
    const vectors = parseVectors(payload.result || '');
    validateVectors(id, vectors);

    bodies[id] = Object.freeze({
      name: metadata.name,
      command: metadata.command,
      color: metadata.color,
      radiusAu: metadata.radiusAu,
      periodDays: metadata.periodDays,
      vectors,
    });
    process.stdout.write(`JPL-HORIZONS body=${id} vectors=${vectors.length} status=ready\n`);
  }

  const counts = new Set(Object.values(bodies).map((body) => body.vectors.length));
  if (counts.size !== 1) {
    throw new Error(`Horizons body vector counts differ: ${[...counts].sort((a, b) => a - b).join(', ')}`);
  }

  const dataset = {
    schema: 'simulatte.jplHorizonsHeliocentricVectors.v1',
    id: 'jpl.horizons.heliocentric-vectors.v1',
    title: 'JPL Horizons heliocentric Cartesian state vectors',
    epochStart: `${options.start}T00:00:00Z`,
    stepDays: parseStepDays(options.step),
    epochCount: Object.values(bodies)[0].vectors.length,
    sourceKind: 'observed_jpl_horizons_vectors',
    provenance: {
      source: 'NASA/JPL Horizons API',
      retrievedAt,
      query: {
        center: '500@10',
        ephemerisType: 'VECTORS',
        vectorTable: 2,
        outputUnits: 'AU-D',
        referencePlane: 'ECLIPTIC',
        referenceSystem: 'ICRF',
        start: options.start,
        stop: options.stop,
        step: options.step,
      },
      claimBoundary: 'Pinned JPL Horizons state-vector snapshot for deterministic mission-design experiments; not an operational navigation service.',
    },
    bodies,
  };

  const datasetText = `${JSON.stringify(dataset, null, 2)}\n`;
  atomicWrite(OUTPUT_PATH, datasetText);
  const datasetSha256 = sha256(datasetText);
  updateDatasetManifest({
    id: dataset.id,
    filename: path.basename(OUTPUT_PATH),
    schemaId: dataset.schema,
    sha256: datasetSha256,
    sourceKind: dataset.sourceKind,
    retrievedAt,
  });

  process.stdout.write(
    `JPL-HORIZONS status=written file=${OUTPUT_PATH} vectors=${dataset.epochCount} sha256=${datasetSha256}\n`,
  );
}

function horizonsUrl(command, { start, stop, step }) {
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
  const params = {
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    VEC_TABLE: "'2'",
    OUT_UNITS: "'AU-D'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    CSV_FORMAT: "'YES'",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function fetchJsonWithRetry(url, { attempts, timeoutMs }) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Simulatte governed orbital-data builder',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Horizons HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = await response.json();
      if (typeof payload?.result !== 'string') {
        throw new Error('Horizons response did not contain a result string');
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Horizons fetch failed after ${attempts} attempts: ${lastError?.message || lastError}`);
}

function parseVectors(result) {
  const rows = [];
  let active = false;
  for (const raw of String(result).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '$$SOE') {
      active = true;
      continue;
    }
    if (line === '$$EOE') break;
    if (!active || !line) continue;

    const columns = parseCsv(line);
    const julianDateTdb = Number(columns[0]);
    const numeric = columns.slice(2).map(Number);
    if (!Number.isFinite(julianDateTdb) || numeric.length < 6 || numeric.slice(0, 6).some((value) => !Number.isFinite(value))) {
      continue;
    }
    rows.push(Object.freeze({
      day: rows.length,
      julianDateTdb,
      calendarDateTdb: String(columns[1] || '').trim(),
      positionAu: Object.freeze(numeric.slice(0, 3)),
      velocityAuD: Object.freeze(numeric.slice(3, 6)),
    }));
  }
  return Object.freeze(rows);
}

function validateVectors(bodyId, vectors) {
  if (!Array.isArray(vectors) || vectors.length < 2) {
    throw new Error(`No usable Horizons vectors parsed for ${bodyId}`);
  }
  for (let index = 0; index < vectors.length; index += 1) {
    const row = vectors[index];
    if (row.day !== index) throw new Error(`${bodyId} vector day index is discontinuous at ${index}`);
    if (index > 0 && !(row.julianDateTdb > vectors[index - 1].julianDateTdb)) {
      throw new Error(`${bodyId} Julian dates are not strictly increasing at ${index}`);
    }
  }
}

function updateDatasetManifest(entry) {
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { schema: 'simulatte.orbitalTransferDatasetManifest.v1', generatedAt: entry.retrievedAt, datasets: [] };

  if (manifest.schema !== 'simulatte.orbitalTransferDatasetManifest.v1' || !Array.isArray(manifest.datasets)) {
    throw new Error(`Unexpected orbital dataset manifest at ${MANIFEST_PATH}`);
  }

  const next = manifest.datasets.filter((row) => row.id !== entry.id);
  next.push(entry);
  next.sort((left, right) => left.id.localeCompare(right.id));
  manifest.generatedAt = entry.retrievedAt;
  manifest.datasets = next;
  atomicWrite(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = {
    start: '2030-09-15',
    stop: '2032-09-14',
    step: '1 d',
    attempts: 4,
    timeoutMs: 45_000,
  };
  for (const arg of argv) {
    const [key, value] = arg.split('=', 2);
    if (key === '--start') options.start = required(value, key);
    else if (key === '--stop') options.stop = required(value, key);
    else if (key === '--step') options.step = required(value, key);
    else if (key === '--attempts') options.attempts = positiveInteger(value, key);
    else if (key === '--timeout-ms') options.timeoutMs = positiveInteger(value, key);
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/fetch-orbital-tier.mjs [--start=YYYY-MM-DD] [--stop=YYYY-MM-DD] [--step="1 d"] [--attempts=4] [--timeout-ms=45000]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(Date.parse(`${options.start}T00:00:00Z`))) throw new Error(`Invalid --start: ${options.start}`);
  if (!Number.isFinite(Date.parse(`${options.stop}T00:00:00Z`))) throw new Error(`Invalid --stop: ${options.stop}`);
  if (Date.parse(options.stop) <= Date.parse(options.start)) throw new Error('--stop must be after --start');
  parseStepDays(options.step);
  return Object.freeze(options);
}

function parseStepDays(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*d(?:ay)?s?$/i.exec(String(value).trim());
  if (!match) throw new Error(`Only day-based Horizons steps are supported, received: ${value}`);
  const days = Number(match[1]);
  if (!(days > 0)) throw new Error(`Step must be positive, received: ${value}`);
  return days;
}

function parseCsv(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

function atomicWrite(target, content) {
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, target);
}

function required(value, name) {
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} requires a positive integer`);
  return parsed;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
