#!/usr/bin/env node
// DOT/FHWA Freight Analysis Framework (FAF5) — commodity origin-destination and mode
// priors between regions. Aggregate flows; synthesise corridors, not company shipments.
// https://ops.fhwa.dot.gov/freight/freight_analysis/faf/
import { ingest, runIfMain } from './ingest-lib.mjs';
async function main() {
  await ingest({
    sourceId: 'dot-faf5-freight',
    url: 'https://faf.ornl.gov/faf5/api/flows?commodity=agriculture',
    query: { commodity: 'agriculture' },
    license: 'public-domain-us-government',
    transformVersion: 'food-recall-ingest-1.0.0',
    claimBoundary: 'FAF5 provides aggregate regional freight flows; used only to synthesise corridor priors, never individual company shipments.',
    extract: (json) => json.flows || [],
  });
}
runIfMain(import.meta, main);
