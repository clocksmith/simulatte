#!/usr/bin/env node
// NOAA NCEI historical weather snapshot (temperature/precip/wind). Download, pin,
// interpolate, and hash before a reproducible run. https://www.ncei.noaa.gov/cdo-web/webservices
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  const token = process.env.NOAA_CDO_TOKEN;
  if (!token) throw new Error('fetch-noaa-snapshot requires NOAA_CDO_TOKEN');
  await ingest({
    sourceId: 'noaa-ncei-weather',
    url: 'https://www.ncei.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&startdate=2026-07-01&enddate=2026-07-21&limit=1000',
    query: { datasetid: 'GHCND', startdate: '2026-07-01', enddate: '2026-07-21' },
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'NOAA observations are pinned and hashed for reproducibility. A live mode must capture and hash all returned observations.',
    extract: (json) => json.results || [],
  });
}
runIfMain(import.meta, main);
