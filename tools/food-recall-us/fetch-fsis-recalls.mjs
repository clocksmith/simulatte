#!/usr/bin/env node
// USDA-FSIS recall & public-health-alert API (meat, poultry, processed egg). Separate
// jurisdiction and schema from FDA. https://www.fsis.usda.gov/science-data/developer-resources/recall-api
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'usda-fsis-recalls',
    url: 'https://www.fsis.usda.gov/fsis/api/recall/v/1',
    query: {},
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'FSIS recalls cover meat/poultry/egg under separate jurisdiction; normalize without erasing the FDA/FSIS regulator distinction.',
    extract: (json) => Array.isArray(json) ? json : (json.results || []),
  });
}
runIfMain(import.meta, main);
