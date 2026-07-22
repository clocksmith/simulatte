#!/usr/bin/env node
// Census ACS — consumer-zone population and demographic strata. Aggregate estimates;
// high-risk health status must not be inferred at individual level.
// https://www.census.gov/programs-surveys/acs/data/data-via-api.html
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'census-acs-consumer-zones',
    url: 'https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B01001_020E&for=state:*',
    query: { get: 'NAME,B01003_001E,B01001_020E', for: 'state:*' },
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'ACS is aggregate population/demographic estimate data; individual-level high-risk health status is never inferred.',
    extract: (rows) => Array.isArray(rows) ? rows.slice(1) : [],
  });
}
runIfMain(import.meta, main);
