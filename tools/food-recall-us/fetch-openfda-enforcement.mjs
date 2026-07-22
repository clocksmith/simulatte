#!/usr/bin/env node
// FDA openFDA food enforcement reports (recall event history). openFDA is updated weekly
// from publicly releasable Recall Enterprise System records; FDA warns it is NOT a
// recall-lifecycle tracker. https://open.fda.gov/apis/food/enforcement/
import { ingest, runIfMain } from './ingest-lib.mjs';
const LIMIT = Number(process.env.FOOD_INGEST_LIMIT || 1000);
async function main() {
  await ingest({
    sourceId: 'fda-openfda-food-enforcement',
    url: `https://api.fda.gov/food/enforcement.json?search=report_date:[20180101+TO+20261231]&limit=${LIMIT}`,
    query: { search: 'report_date:[20180101 TO 20261231]', limit: LIMIT },
    license: 'public-domain-us-government',
    sourceUpdatedThrough: 'weekly-refresh',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'openFDA food enforcement is publicly releasable RES data updated weekly; it is not a complete recall-lifecycle record and omits consignee networks.',
    extract: (json) => json.results || [],
  });
}
runIfMain(import.meta, main);
