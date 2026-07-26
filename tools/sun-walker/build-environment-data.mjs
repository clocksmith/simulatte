#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT = path.join(ROOT, 'public/data/sun-walker/sun-walker-environment-v1.json');
const RETRIEVED_AT = '2026-07-25T00:00:00Z';
const TREE_URL = new URL('https://data.cityofnewyork.us/resource/uvpi-gqnh.json');
TREE_URL.searchParams.set(
  '$select',
  'tree_id,block_id,created_at,tree_dbh,status,health,spc_latin,spc_common,latitude,longitude'
);
TREE_URL.searchParams.set(
  '$where',
  'latitude between 40.705 and 40.745 and longitude between -74.015 and -73.94 and status="Alive"'
);
TREE_URL.searchParams.set('$limit', '50000');
TREE_URL.searchParams.set('$order', 'tree_id');

const WEATHER_URL = new URL('https://www.ncei.noaa.gov/access/services/data/v1');
WEATHER_URL.searchParams.set('dataset', 'global-hourly');
WEATHER_URL.searchParams.set('stations', '72505394728');
WEATHER_URL.searchParams.set('startDate', '2024-07-18');
WEATHER_URL.searchParams.set('endDate', '2024-07-19');
WEATHER_URL.searchParams.set('format', 'json');
WEATHER_URL.searchParams.set('includeAttributes', 'true');
WEATHER_URL.searchParams.set('includeStationName', 'true');

const [treeRaw, weatherRaw] = await Promise.all([download(TREE_URL), download(WEATHER_URL)]);
const treeSourceRows = JSON.parse(treeRaw);
const weatherSourceRows = JSON.parse(weatherRaw).filter((row) => row.REPORT_TYPE === 'FM-15');

const output = {
  schema: 'simulatte.sunWalkerEnvironment.v1',
  id: 'sun-walker.environment.v1',
  contentVersion: '2026-07-25',
  owner: 'sun-walker',
  generatedAt: RETRIEVED_AT,
  coverage: {
    worldId: 'nyc-core-autonomy-v1',
    boundsWgs84: { north: 40.745, south: 40.705, east: -73.94, west: -74.015 },
    canopyObservationPeriod: ['2015-05-26', '2016-10-25'],
    weatherObservationPeriod: ['2024-07-18T00:00:00Z', '2024-07-19T23:59:59Z'],
  },
  sources: [
    {
      id: 'nyc-2015-street-tree-census',
      datasetId: 'uvpi-gqnh',
      publisher: 'NYC Department of Parks and Recreation',
      url: TREE_URL.toString(),
      landingPage: 'https://dev.socrata.com/foundry/data.cityofnewyork.us/uvpi-gqnh',
      retrievedAt: RETRIEVED_AT,
      license: 'NYC Open Data Terms of Use',
      licenseUrl: 'https://opendata.cityofnewyork.us/overview/#termsofuse',
      rawSha256: sha256(treeRaw),
      rawByteCount: Buffer.byteLength(treeRaw),
      rowIdentityField: 'tree_id',
      rowCount: treeSourceRows.length,
      temporalStatus: 'historical',
      limitations: [
        'The census was collected from May 2015 through October 2016 and is not a current tree inventory.',
        'Tree diameter is observed; crown radius, crown height, and transmissivity are modeled.',
        'Only living trees inside the frozen world bounding box are retained.',
      ],
    },
    {
      id: 'ncei-global-hourly-central-park',
      datasetId: 'global-hourly',
      stationId: '72505394728',
      publisher: 'NOAA National Centers for Environmental Information',
      url: WEATHER_URL.toString(),
      landingPage: 'https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database',
      retrievedAt: RETRIEVED_AT,
      license: 'United States public-domain federal data, subject to source notices',
      licenseUrl: 'https://www.ncei.noaa.gov/sites/g/files/anmtlf171/files/2023-12/NCEI%20PD-10-2-02%20-%20Open%20Data%20Policy%20Signed.pdf',
      rawSha256: sha256(weatherRaw),
      rawByteCount: Buffer.byteLength(weatherRaw),
      rowIdentityField: 'STATION + DATE + REPORT_TYPE',
      rowCount: weatherSourceRows.length,
      temporalStatus: 'historical',
      limitations: [
        'One Central Park station is used as a historical weather analog for the bounded world.',
        'Station observations are not a street-level irradiance measurement.',
        'Sky-condition attenuation is modeled from reported METAR sky codes.',
      ],
    },
  ],
  canopy: {
    schema: 'simulatte.sunWalkerCanopyRows.v1',
    model: {
      id: 'dbh-canopy-envelope-v1',
      crownRadiusEquation: 'clamp(1.25 + 0.09 * diameterInches, 1.5, 6.5)',
      crownCenterHeightEquation: 'clamp(3.5 + 0.22 * diameterInches, 4.0, 11.0)',
      crownHalfHeightEquation: 'clamp(1.0 + 0.06 * diameterInches, 1.25, 3.5)',
      directBeamTransmittanceByHealth: { Good: 0.18, Fair: 0.28, Poor: 0.42, unknown: 0.35 },
      calibrationStatus: 'engineering-bounds-only; not calibrated against street irradiance',
    },
    rows: treeSourceRows.map((row) => ({
      id: `tree:${row.tree_id}`,
      sourceRowId: row.tree_id,
      blockId: row.block_id || null,
      observedAt: normalizeDate(row.created_at),
      latitude: number(row.latitude),
      longitude: number(row.longitude),
      diameterInches: number(row.tree_dbh),
      status: row.status || null,
      health: row.health || 'unknown',
      speciesLatin: row.spc_latin || null,
      speciesCommon: row.spc_common || null,
      truth: observedHistorical(),
    })),
  },
  weather: {
    schema: 'simulatte.sunWalkerWeatherRows.v1',
    station: {
      id: '72505394728',
      name: weatherSourceRows[0]?.NAME?.trim() || 'NY CITY CENTRAL PARK, NY US',
      latitude: number(weatherSourceRows[0]?.LATITUDE),
      longitude: number(weatherSourceRows[0]?.LONGITUDE),
      elevationM: number(weatherSourceRows[0]?.ELEVATION),
    },
    model: {
      id: 'metar-sky-direct-beam-attenuation-v1',
      directBeamFactorByCode: { CLR: 1, SKC: 1, FEW: 0.85, SCT: 0.65, BKN: 0.35, OVC: 0.15, VV: 0.1, unknown: 0.5 },
      interpolation: 'nearest observation by month-day and UTC minute within the pinned historical analog period',
      calibrationStatus: 'categorical engineering mapping; not calibrated against pyranometer irradiance',
    },
    rows: weatherSourceRows.map((row) => {
      const skyCode = metarSkyCode(row.REM);
      return {
        id: `weather:${row.STATION}:${row.DATE}:FM-15`,
        sourceRowId: `${row.STATION}:${row.DATE}:FM-15`,
        stationId: row.STATION,
        observedAt: `${row.DATE}Z`,
        airTemperatureC: tenths(row.TMP),
        dewPointC: tenths(row.DEW),
        windSpeedMps: windSpeed(row.WND),
        visibilityM: scaled(row.VIS, 1),
        ceilingM: scaled(row.CIG, 1),
        skyCode,
        sourceCode: row.SOURCE || null,
        qualityControl: row.QUALITY_CONTROL || null,
        metar: metar(row.REM),
        truth: observedHistorical(),
      };
    }),
  },
  validation: {
    expectedCanopyRows: treeSourceRows.length,
    expectedWeatherRows: weatherSourceRows.length,
    uniqueCanopyRowIds: new Set(treeSourceRows.map((row) => row.tree_id)).size,
    uniqueWeatherRowIds: new Set(weatherSourceRows.map((row) => `${row.STATION}:${row.DATE}:FM-15`)).size,
    calibrationCases: [
      {
        id: 'clear-sky-factor',
        input: { skyCode: 'CLR' },
        expected: { directBeamFactor: 1 },
      },
      {
        id: 'overcast-factor',
        input: { skyCode: 'OVC' },
        expected: { directBeamFactor: 0.15 },
      },
      {
        id: 'healthy-10-inch-tree-envelope',
        input: { diameterInches: 10, health: 'Good' },
        expected: { crownRadiusM: 2.15, crownCenterHeightM: 5.7, crownHalfHeightM: 1.6, directBeamTransmittance: 0.18 },
      },
    ],
  },
  truth: {
    origin: 'observed',
    temporalStatus: 'historical',
    uncertainty: {
      kind: 'missing',
      value: {
        currentTreeState: true,
        measuredCrownGeometry: true,
        streetLevelIrradiance: true,
        weatherSpatialVariation: true,
      },
    },
  },
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(output)}\n`);
process.stdout.write(`${OUTPUT}\nsha256 ${sha256(await fs.readFile(OUTPUT))}\n`);

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Simulatte governed data builder/1.0' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeDate(value) {
  return value ? `${value.replace('.000', '')}Z` : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tenths(value) {
  if (!value || /^\+?9999/.test(value)) return null;
  return number(value.split(',')[0]) / 10;
}

function scaled(value, divisor) {
  if (!value) return null;
  const parsed = number(value.split(',')[0]);
  return parsed === null || parsed >= 99999 ? null : parsed / divisor;
}

function windSpeed(value) {
  if (!value) return null;
  const parsed = number(value.split(',')[3]);
  return parsed === null || parsed >= 9999 ? null : parsed / 10;
}

function metar(value) {
  const marker = value?.match(/\bMETAR\s+(.+)$/);
  return marker ? marker[1] : null;
}

function metarSkyCode(value) {
  const report = metar(value) || '';
  return report.match(/\b(CLR|SKC|FEW|SCT|BKN|OVC|VV)\d{0,3}\b/)?.[1] || 'unknown';
}

function observedHistorical() {
  return {
    origin: 'observed',
    temporalStatus: 'historical',
    uncertainty: { kind: 'confidence', value: { sourceIdentityRetained: true, sourceQualityFlagsRetained: true } },
  };
}
