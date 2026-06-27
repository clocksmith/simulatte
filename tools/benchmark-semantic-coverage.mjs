import {
  REQUIRED_INDEX_NAMES,
  lexicalUniverseMatches,
  loadUniversePackage,
} from './simulatte-universe-utils.mjs';

const DEFAULT_PROMPTS = Object.freeze([
  'laser heats ferrofluid lens over copper coil',
  'subway queue grid reroutes after power surge',
  'undersea vent crystallizes pressure brine',
  'acoustic levitator sorts dust in brass tube',
  'thin film laser bubbles fracture on wire loop',
  'mycelium membrane pumps nutrient gel waves',
  'ceramic kiln sinters cracked porcelain in humid air',
  'orbiting mirror swarm focuses sunlight on algae pond',
  'warehouse robots jam around a leaking battery pallet',
  'molten salt battery breathes through a graphite foam stack',
]);

async function main() {
  const universe = await loadUniversePackage();
  const prompts = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PROMPTS;
  const rows = prompts.map((prompt) => coverageForPrompt(universe.indexes, prompt));
  const indexCounts = Object.fromEntries(Object.entries(universe.indexes).map(([name, index]) => [
    name,
    index.documents.length,
  ]));
  const report = {
    schema: 'simulatte.semanticCoverageBenchmark.v1',
    manifestId: universe.manifest.id,
    indexCounts,
    promptCount: rows.length,
    meanCoverage: round(rows.reduce((sum, row) => sum + row.coverage, 0) / Math.max(1, rows.length)),
    rows,
    weakIndexes: REQUIRED_INDEX_NAMES.filter((name) => !indexCounts[name]),
  };
  console.log(JSON.stringify(report, null, 2));
  const strictThreshold = Number(process.env.SIMULATTE_COVERAGE_MIN || 0);
  if (strictThreshold > 0 && report.meanCoverage < strictThreshold) {
    process.exitCode = 1;
  }
}

function coverageForPrompt(indexes, prompt) {
  const matches = lexicalUniverseMatches(indexes, prompt, { maxPerIndex: 4 });
  const matchedIndexes = Object.entries(matches.byIndex)
    .filter(([, rows]) => rows.length)
    .map(([name]) => name)
    .sort();
  const topMatches = matches.candidates.slice(0, 12);
  const coveredTokenSet = new Set();
  const promptTokens = matches.tokens.filter((token) => token.length > 2);
  for (const token of promptTokens) {
    if (topMatches.some((match) => String(match.label || '').toLowerCase().includes(token))) {
      coveredTokenSet.add(token);
    }
  }
  const missingTokens = promptTokens.filter((token) => !coveredTokenSet.has(token));
  return {
    prompt,
    coverage: round(coveredTokenSet.size / Math.max(1, promptTokens.length)),
    matchedIndexes,
    topMatches,
    missingTokens,
  };
}

function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
