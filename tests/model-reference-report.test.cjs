const test=require('node:test'),assert=require('node:assert/strict');
test('reference report separates unfitted evaluation, published comparisons, and numerical convergence',async()=>{
 const {verifyReferences}=await import('../tools/simulatte/verify-model-references.mjs');
 const report=verifyReferences();assert.equal(report.pass,true);
 assert.equal(report.calibration.caseIds.length,0);assert.equal(report.calibration.fittedParameters.length,0);
 assert.equal(report.evaluation.cases.length,31);
 assert.equal(new Set(report.evaluation.cases.map(c=>c.id)).size,31);
 assert.equal(report.uncertainty.kind,'unquantified-model-discrepancy');
});
