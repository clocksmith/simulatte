import {
  loadUniversePackage,
  validateUniversePackage,
} from './simulatte-universe-utils.mjs';

async function main() {
  const universe = await loadUniversePackage();
  const result = validateUniversePackage(universe);
  const report = {
    schema: 'simulatte.semanticUniverseValidation.v1',
    ok: result.ok,
    documentCount: result.documentCount,
    errors: result.errors,
    warnings: result.warnings,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
