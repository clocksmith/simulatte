#!/usr/bin/env node
// Normalize FDA openFDA + FSIS + CDC snapshots into one historical-recalls artifact with
// a preserved regulator distinction and observed/reconstructed labels. Reads pinned
// snapshots when present; otherwise reports what is missing (no fabrication).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSnapshot, snapshotDir, sha256 } from './ingest-lib.mjs';

function normalizeOpenFda(records) {
  return records.map((row, index) => ({
    id: `recall:fda:${row.recall_number || index}`, regulator: 'FDA', class: (row.classification || '').replace('Class ', '') || null,
    commodity: null, product: row.product_description || null, firm: row.recalling_firm || null,
    distributionPattern: row.distribution_pattern || null, reason: row.reason_for_recall || null,
    reportDate: row.report_date || null, states: null, observed: true,
  }));
}
function normalizeFsis(records) {
  return records.map((row, index) => ({
    id: `recall:fsis:${row.field_recall_number || index}`, regulator: 'FSIS', class: row.field_recall_classification || null,
    commodity: 'meat_poultry_egg', product: row.field_title || null, firm: row.field_establishment || null,
    distributionPattern: row.field_states || null, reason: row.field_recall_reason || null,
    reportDate: row.field_recall_date || null, observed: true,
  }));
}

function main() {
  const fda = readSnapshot('fda-openfda-food-enforcement');
  const fsis = readSnapshot('usda-fsis-recalls');
  const records = [];
  const inputs = [];
  if (fda) { records.push(...normalizeOpenFda(fda.records)); inputs.push({ sourceId: fda.sourceId, sha256: fda.contentSha256 }); }
  if (fsis) { records.push(...normalizeFsis(fsis.records)); inputs.push({ sourceId: fsis.sourceId, sha256: fsis.contentSha256 }); }
  if (!records.length) {
    process.stderr.write(`No pinned snapshots found in ${snapshotDir}. Run fetch-openfda-enforcement.mjs / fetch-fsis-recalls.mjs first.\n`);
    process.exit(2);
  }
  const out = {
    schema: 'simulatte.usFoodHistoricalRecalls.v1',
    claimBoundary: 'Normalized public enforcement records with preserved FDA/FSIS regulator distinction. Consignee networks are not reconstructed.',
    inputs, records,
  };
  const text = `${JSON.stringify(out, null, 2)}\n`;
  const path = join(snapshotDir, '..', 'historical-recalls-observed-v1.json');
  writeFileSync(path, text);
  process.stdout.write(`Wrote ${path}\n  records=${records.length} sha256=${sha256(text).slice(0, 12)}\n`);
}
main();
