#!/usr/bin/env node
// USDA NASS Quick Stats — geographic production priors by commodity. Aggregate
// production estimates, not observed shipment links. Requires NASS_API_KEY.
// https://quickstats.nass.usda.gov/api
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  const key = process.env.NASS_API_KEY;
  if (!key) throw new Error('fetch-usda-nass requires NASS_API_KEY');
  await ingest({
    sourceId: 'usda-nass-production',
    url: `https://quickstats.nass.usda.gov/api/api_GET/?key=${key}&commodity_desc=LETTUCE&statisticcat_desc=PRODUCTION&format=JSON`,
    query: { commodity_desc: 'LETTUCE', statisticcat_desc: 'PRODUCTION' },
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'NASS production is aggregate geographic estimate data used as origin priors, not observed commercial shipments.',
    extract: (json) => json.data || [],
  });
}
runIfMain(import.meta, main);
