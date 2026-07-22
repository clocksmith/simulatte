#!/usr/bin/env node
// FDA CORE outbreak investigation table (investigation stages, pathogens, products,
// case counts, traceback/recall actions). Not a complete list of every US incident.
// https://www.fda.gov/food/outbreaks-foodborne-illness/
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'fda-core-investigations',
    url: 'https://datadashboard.fda.gov/ora/api/coreOutbreak.json',
    query: {},
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'FDA CORE covers FDA-managed outbreak investigations only; case counts and stages are as-published, not a complete national incidence.',
    extract: (json) => json.result || json.results || [],
  });
}
runIfMain(import.meta, main);
