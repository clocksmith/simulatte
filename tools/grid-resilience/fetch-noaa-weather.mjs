#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'public/data/grid-resilience-us');
const day = '2024-07-15';
const stations = [
  { id: '72494023234', regionId: 'west', name: 'San Francisco International Airport', coordinates: [-122.36562, 37.61962] },
  { id: '72259003927', regionId: 'texas', name: 'Dallas/Fort Worth International Airport', coordinates: [-97.038, 32.896] },
  { id: '72530094846', regionId: 'central', name: "Chicago O'Hare International Airport", coordinates: [-87.9047, 41.9786] },
  { id: '74486094789', regionId: 'east', name: 'John F. Kennedy International Airport', coordinates: [-73.7622, 40.6386] },
];
fs.mkdirSync(output, { recursive: true });
const observations = [];
const sourceReceipts = [];
for (const station of stations) {
  const url = `https://www.ncei.noaa.gov/data/global-hourly/access/2024/${station.id}.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NOAA station ${station.id} failed: ${response.status}`);
  const body = await response.text();
  sourceReceipts.push({ stationId: station.id, url, responseHash: sha256(body) });
  parseCsv(body).filter((row) => row.DATE?.startsWith(day) && row.REPORT_TYPE === 'FM-15')
    .forEach((row) => observations.push(withIdentity({
      stationId: station.id,
      regionId: station.regionId,
      timestamp: row.DATE,
      airTemperatureC: codedTenths(row.TMP),
      dewPointC: codedTenths(row.DEW),
      windSpeedMps: codedWind(row.WND),
      qualityFields: { airTemperature: row.TMP, dewPoint: row.DEW, wind: row.WND },
      truth: truth('observed', 'historical', 'missing', {
        reason: 'Station observation flags are retained; no spatial representativeness interval is published.',
      }),
    })));
}
write('noaa-weather-stations-v1.json', {
  schema: 'simulatte.gridNoaaWeatherStations.v1',
  id: 'grid-noaa-weather-stations-v1',
  source: sourceMetadata(),
  stations: stations.map((row) => withIdentity({
    ...row,
    coordinateClassification: 'observed_station_metadata',
    truth: truth('observed', 'historical', 'missing', { reason: 'No regional representativeness claim.' }),
  })),
});
write('noaa-weather-observations-v1.json', {
  schema: 'simulatte.gridNoaaWeatherObservations.v1',
  id: 'grid-noaa-weather-observations-v1',
  source: sourceMetadata(),
  sourceReceipts,
  period: { start: `${day}T00:00:00`, end: `${day}T23:59:59` },
  observations,
});

function sourceMetadata() {
  return {
    publisher: 'NOAA National Centers for Environmental Information',
    product: 'Integrated Surface Database Global Hourly',
    documentationUrl: 'https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database',
    license: 'U.S. government public data; attribution retained',
    retrievalDate: '2026-07-26',
    transformationVersion: 'grid-noaa-promoter-v1',
  };
}

function codedTenths(value) {
  const number = Number(String(value || '').split(',')[0]);
  return Number.isFinite(number) && Math.abs(number) < 9999 ? number / 10 : null;
}

function codedWind(value) {
  const number = Number(String(value || '').split(',')[3]);
  return Number.isFinite(number) && number < 9999 ? number / 10 : null;
}

function parseCsv(body) {
  const lines = body.trim().split(/\r?\n/);
  const headers = csvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(csvLine(line).map((value, index) => [headers[index], value])));
}

function csvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
}

function withIdentity(row) {
  return { ...row, rowId: `noaa:${row.stationId}:${row.timestamp || 'station'}`, rowHash: sha256(stable(row)) };
}

function truth(origin, temporalStatus, kind, value) {
  return { origin, temporalStatus, uncertainty: { kind, value } };
}

function write(name, value) {
  fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`GRID-NOAA wrote=${name}`);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
