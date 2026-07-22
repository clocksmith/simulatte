#!/usr/bin/env node
// FDA Reportable Food Registry annual aggregates (hazard-commodity patterns, early
// warning frequencies). Aggregate public data, not shipment/facility linkage.
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'fda-reportable-food-registry',
    url: 'https://www.fda.gov/media/rfr-annual-aggregate.json',
    query: {},
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'RFR is aggregate hazard-commodity frequency data; it does not link facilities or shipments.',
    extract: (json) => json.records || [],
  });
}
runIfMain(import.meta, main);
