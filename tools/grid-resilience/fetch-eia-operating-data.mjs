#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'public/data/grid-resilience-us');
const apiKey = process.env.EIA_API_KEY || (process.argv.includes('--demo-key') ? 'DEMO_KEY' : '');
if (!apiKey) throw new Error('Set EIA_API_KEY or pass --demo-key for the public EIA demonstration key.');

const respondents = ['CISO', 'ERCO', 'MISO', 'PJM'];
const start = '2024-07-15T00';
const end = '2024-07-15T23';
fs.mkdirSync(output, { recursive: true });

const demandRows = [];
const generationRows = [];
const requests = [];
for (const respondent of respondents) {
  const demand = await request('region-data', respondent, ['D']);
  demandRows.push(...demand.rows);
  requests.push(demand.receipt);
  const generation = await request('fuel-type-data', respondent);
  generationRows.push(...generation.rows);
  requests.push(generation.receipt);
}

write('eia-balancing-authority-hourly-v1.json', {
  schema: 'simulatte.gridEiaBalancingAuthorityHourly.v1',
  id: 'grid-eia-balancing-authority-hourly-v1',
  source: sourceMetadata(),
  period: { start, end, frequency: 'hourly' },
  requests: requests.filter((row) => row.route.includes('region-data')),
  rows: demandRows,
});
write('eia-generation-mix-hourly-v1.json', {
  schema: 'simulatte.gridEiaGenerationMixHourly.v1',
  id: 'grid-eia-generation-mix-hourly-v1',
  source: sourceMetadata(),
  period: { start, end, frequency: 'hourly' },
  requests: requests.filter((row) => row.route.includes('fuel-type-data')),
  rows: generationRows,
});

async function request(route, respondent, types = []) {
  const query = new URLSearchParams({
    frequency: 'hourly',
    start,
    end,
    offset: '0',
    length: '5000',
  });
  query.set('data[0]', 'value');
  query.set('facets[respondent][]', respondent);
  types.forEach((type) => query.append('facets[type][]', type));
  query.set('sort[0][column]', 'period');
  query.set('sort[0][direction]', 'asc');
  const publicUrl = `https://api.eia.gov/v2/electricity/rto/${route}/data/?${query}`;
  const response = await fetch(`${publicUrl}&api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`EIA ${route}/${respondent} failed: ${response.status}`);
  const body = await response.text();
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed.response?.data)) throw new Error(`EIA response missing rows for ${route}/${respondent}`);
  return {
    receipt: {
      route: `/v2/electricity/rto/${route}/data`,
      normalizedQuery: query.toString(),
      requestHash: sha256(publicUrl),
      responseHash: sha256(body),
      retrievedAt: '2026-07-26T00:00:00Z',
      responseVersion: 'EIA API v2',
    },
    rows: parsed.response.data.map((row) => withIdentity({
      period: row.period,
      respondent: row.respondent,
      respondentName: row['respondent-name'],
      type: row.type || null,
      typeName: row['type-name'],
      fuelType: row.fueltype || null,
      value: Number(row.value),
      unit: row['value-units'],
      revisionStatus: 'agency-reported; values may be revised or imputed',
      truth: truth('observed', 'historical', 'missing', {
        reason: 'EIA does not publish row-level measurement uncertainty in this route.',
      }),
    })),
  };
}

function sourceMetadata() {
  return {
    publisher: 'U.S. Energy Information Administration',
    documentationUrl: 'https://www.eia.gov/opendata/documentation.php',
    license: 'U.S. government public data; attribution retained',
    retrievalDate: '2026-07-26',
    transformationVersion: 'grid-eia-promoter-v1',
    caveat: 'Agency-reported balancing-authority aggregates may be revised, imputed, or incomplete.',
  };
}

function withIdentity(row) {
  return { ...row, rowId: `eia:${row.respondent}:${row.period}:${row.type || row.fuelType}`, rowHash: sha256(stable(row)) };
}

function truth(origin, temporalStatus, kind, value) {
  return { origin, temporalStatus, uncertainty: { kind, value } };
}

function write(name, value) {
  fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`GRID-EIA wrote=${name} rows=${value.rows.length}`);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
