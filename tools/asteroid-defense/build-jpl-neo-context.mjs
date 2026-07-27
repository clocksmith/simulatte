#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT = path.join(ROOT, 'public/data/asteroid-defense/jpl-neo-context-v1.json');
const ENDPOINT = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = [
  'spkid',
  'pdes',
  'full_name',
  'class',
  'pha',
  'neo',
  'epoch',
  'e',
  'a',
  'q',
  'i',
  'om',
  'w',
  'ma',
  'H',
  'diameter',
  'moid',
  'condition_code',
];
const ORBIT_CLASSES = ['IEO', 'ATE', 'APO', 'AMO'];
const ROWS_PER_CLASS = 128;

const retrievedAt = new Date().toISOString();
const responses = [];
for (const orbitClass of ORBIT_CLASSES) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('fields', FIELDS.join(','));
  url.searchParams.set('sb-class', orbitClass);
  url.searchParams.set('sort', 'H');
  url.searchParams.set('limit', String(ROWS_PER_CLASS));
  url.searchParams.set('full-prec', 'true');
  const response = await fetch(url, {
    headers: { 'user-agent': 'Simulatte governed-data builder (https://simulatte.com)' },
  });
  if (!response.ok) throw new Error(`JPL SBDB query failed ${response.status}: ${url}`);
  const value = await response.json();
  if (!Array.isArray(value.fields) || !Array.isArray(value.data) || !value.signature?.source) {
    throw new Error(`JPL SBDB response shape invalid for ${orbitClass}`);
  }
  const indexes = Object.fromEntries(value.fields.map((field, index) => [field, index]));
  for (const field of FIELDS) {
    if (!Number.isInteger(indexes[field])) throw new Error(`JPL SBDB field missing: ${field}`);
  }
  responses.push({
    orbitClass,
    url: url.toString(),
    source: value.signature.source,
    version: value.signature.version,
    count: value.data.length,
    rows: value.data.map((row) => normalizeRow(row, indexes)),
  });
}

const objects = responses
  .flatMap((response) => response.rows)
  .sort((left, right) => (
    left.orbitClass.localeCompare(right.orbitClass)
      || numberOrInfinity(left.absoluteMagnitudeH) - numberOrInfinity(right.absoluteMagnitudeH)
      || left.id.localeCompare(right.id)
  ));
const duplicateIds = duplicates(objects.map((row) => row.id));
if (duplicateIds.length) throw new Error(`Duplicate JPL object identities: ${duplicateIds.join(', ')}`);

const artifact = {
  schema: 'simulatte.asteroidJplNeoCatalog.v1',
  id: 'asteroid-jpl-neo-context-v1',
  generatedBy: 'tools/asteroid-defense/build-jpl-neo-context.mjs',
  retrievedAt,
  source: {
    provider: 'NASA/JPL Solar System Dynamics',
    api: 'Small-Body Database Query API',
    documentationUrl: 'https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html',
    endpoint: ENDPOINT,
    responseSignatures: responses.map(({ orbitClass, source, version, count, url }) => ({
      orbitClass,
      source,
      version,
      count,
      url,
    })),
    access: 'Public NASA/JPL API response; retain the provider and retrieval identity when redistributing.',
  },
  selection: {
    orbitClasses: ORBIT_CLASSES,
    rowsPerClass: ROWS_PER_CLASS,
    order: 'absolute magnitude H ascending within each orbit class',
    interpretation: 'A bounded visual context sample of JPL near-Earth-object records, not the complete catalog.',
  },
  truth: {
    origin: 'observed',
    temporalStatus: 'snapshot',
    uncertainty: {
      kind: 'missing',
      value: {
        interpretation: 'Published osculating elements and catalog fields are retained as reported; null values remain missing.',
      },
    },
  },
  fields: {
    epochTdbJd: 'Osculating-element epoch in TDB Julian date as returned by JPL.',
    semiMajorAxisAu: 'Osculating semi-major axis in astronomical units.',
    eccentricity: 'Osculating eccentricity.',
    perihelionDistanceAu: 'Osculating perihelion distance in astronomical units.',
    inclinationDeg: 'Osculating inclination in degrees.',
    longitudeAscendingNodeDeg: 'Osculating longitude of ascending node in degrees.',
    argumentPerihelionDeg: 'Osculating argument of perihelion in degrees.',
    meanAnomalyDeg: 'Osculating mean anomaly at epoch in degrees.',
    minimumOrbitIntersectionDistanceAu: 'Earth MOID in astronomical units, when published.',
  },
  objects,
  content: {
    objectCount: objects.length,
    rowIdentityHash: sha256(objects.map((row) => row.id)),
  },
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`ASTEROID-JPL-CONTEXT wrote ${objects.length} objects to ${path.relative(ROOT, OUTPUT)}\n`);

function normalizeRow(row, indexes) {
  const id = string(row[indexes.spkid]) || string(row[indexes.pdes]);
  if (!id) throw new Error('JPL SBDB row has no stable identity');
  const result = {
    id: `jpl-sbdb:${id}`,
    spkid: string(row[indexes.spkid]),
    primaryDesignation: string(row[indexes.pdes]),
    fullName: string(row[indexes.full_name])?.trim() || string(row[indexes.pdes]) || id,
    orbitClass: string(row[indexes.class]),
    potentiallyHazardous: yesNo(row[indexes.pha]),
    nearEarthObject: yesNo(row[indexes.neo]),
    epochTdbJd: finite(row[indexes.epoch]),
    eccentricity: finite(row[indexes.e]),
    semiMajorAxisAu: finite(row[indexes.a]),
    perihelionDistanceAu: finite(row[indexes.q]),
    inclinationDeg: finite(row[indexes.i]),
    longitudeAscendingNodeDeg: finite(row[indexes.om]),
    argumentPerihelionDeg: finite(row[indexes.w]),
    meanAnomalyDeg: finite(row[indexes.ma]),
    absoluteMagnitudeH: finite(row[indexes.H]),
    diameterKm: finite(row[indexes.diameter]),
    minimumOrbitIntersectionDistanceAu: finite(row[indexes.moid]),
    conditionCode: finite(row[indexes.condition_code]),
  };
  const required = [
    'epochTdbJd',
    'eccentricity',
    'semiMajorAxisAu',
    'inclinationDeg',
    'longitudeAscendingNodeDeg',
    'argumentPerihelionDeg',
    'meanAnomalyDeg',
  ];
  if (required.some((field) => result[field] === null)) {
    throw new Error(`JPL SBDB row ${result.id} lacks required osculating elements`);
  }
  return result;
}

function string(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : value == null ? null : String(value);
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yesNo(value) {
  if (value === 'Y') return true;
  if (value === 'N') return false;
  return null;
}

function duplicates(values) {
  const seen = new Set();
  const duplicate = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  });
  return [...duplicate];
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function numberOrInfinity(value) {
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}
