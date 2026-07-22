#!/usr/bin/env node
// CDC NORS / NORS Dashboard (FDOSS) historical outbreak distributions: pathogen, food,
// setting, illnesses. Voluntary reporting; public final data lag; suppression possible.
// https://www.cdc.gov/nors/data/
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'cdc-nors-fdoss',
    url: 'https://wwwn.cdc.gov/norsdashboard/api/outbreaks',
    query: {},
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'NORS reporting is voluntary; public final data lag the reporting year and may suppress people/facilities. Use for aggregate priors only.',
    extract: (json) => json.outbreaks || json.results || [],
  });
}
runIfMain(import.meta, main);
