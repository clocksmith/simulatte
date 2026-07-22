#!/usr/bin/env node
// Scenario packs (TODO_PLUGINS §10). A scenario is a declared, reproducible run
// specification: a commodity, a hazard, an origin, contamination seeding, a detection
// profile, and a default intervention. Each is synthetic or historical-replay and
// carries a claim boundary. The plugin loads these to drive deterministic simulations.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'public', 'data', 'food-recall-us');

const PACK = {
  schema: 'simulatte.usFoodScenarioPacks.v1',
  version: 'food-recall-scenario-packs-1.0.0',
  claimBoundary: 'Each scenario estimates outcomes inside a declared synthetic or historical scenario. Not a live recall alert, regulatory classification, medical recommendation, or epidemiological forecast.',
  scenarios: [
    {
      id: 'scenario:leafy-green-baseline', kind: 'synthetic', label: 'Leafy green traceback',
      description: 'Synthetic California romaine lots distributed to multiple U.S. regions; single contaminated grower lot.',
      seed: 'food-recall-leafy-green-001', commodityId: 'product:fresh-romaine', hazardId: 'ecoli-o157',
      originFacilityKind: 'grower', durationDays: 30,
      contamination: { seededLots: 1, prevalence: 0.02, initialLog10CfuPerG: 1.5, hazardStratum: 'general', foodCategory: 'leafy_greens' },
      detectionProfile: 'baseline', defaultIntervention: { type: 'recall', dayOffset: 12, depth: 'consumer', scope: 'lot' },
    },
    {
      id: 'scenario:egg-cold-chain', kind: 'synthetic', label: 'Egg cold-chain disruption',
      description: 'Synthetic shell-egg processing and distribution delay with a reefer failure and targeted recall.',
      seed: 'food-recall-eggs-002', commodityId: 'product:shell-eggs', hazardId: 'salmonella',
      originFacilityKind: 'grower', durationDays: 40,
      contamination: { seededLots: 1, prevalence: 0.03, initialLog10CfuPerG: 0.8, hazardStratum: 'general', foodCategory: 'shell_eggs' },
      coldChainFailure: { corridorStage: 'distributor', repairHours: 18, ambientTempC: 28 },
      detectionProfile: 'baseline', defaultIntervention: { type: 'recall', dayOffset: 16, depth: 'retail', scope: 'lot' },
    },
    {
      id: 'scenario:listeria-rte', kind: 'synthetic', label: 'Listeria in ready-to-eat food',
      description: 'Long shelf-life RTE soft cheese exposure with a high-risk population stratum.',
      seed: 'food-recall-listeria-003', commodityId: 'product:rte-soft-cheese', hazardId: 'listeria-monocytogenes',
      originFacilityKind: 'processor', durationDays: 60,
      contamination: { seededLots: 1, prevalence: 0.05, initialLog10CfuPerG: 0.3, hazardStratum: 'older-or-immunocompromised', foodCategory: 'ready_to_eat_dairy' },
      detectionProfile: 'delayed', defaultIntervention: { type: 'recall', dayOffset: 28, depth: 'consumer', scope: 'lot' },
    },
    {
      id: 'scenario:allergen-label', kind: 'synthetic', label: 'Undeclared allergen',
      description: 'Lot-specific undeclared-peanut labeling failure in packaged bakery; no microbial kinetics.',
      seed: 'food-recall-allergen-004', commodityId: 'product:packaged-cookie', hazardId: 'undeclared-peanut',
      originFacilityKind: 'processor', durationDays: 45,
      contamination: { seededLots: 1, prevalence: 1.0, presenceMg: 4, hazardStratum: 'susceptible', foodCategory: 'packaged_bakery' },
      detectionProfile: 'baseline', defaultIntervention: { type: 'recall', dayOffset: 10, depth: 'consumer', scope: 'lot' },
    },
  ],
};

function main() {
  mkdirSync(outDir, { recursive: true });
  const text = `${JSON.stringify({ ...PACK, generatedBy: 'tools/food-recall-us/build-scenario-packs.mjs' }, null, 2)}\n`;
  const path = join(outDir, 'scenario-packs-v1.json');
  writeFileSync(path, text);
  process.stdout.write(`Wrote ${path}\n  scenarios=${PACK.scenarios.length} sha256=${createHash('sha256').update(text).digest('hex').slice(0, 12)}\n`);
}

main();
