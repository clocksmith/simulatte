 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-03.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {validateProblem}=require('../tools/simulatte/study-contract.cjs');
const consumer=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
const docs=Object.values(authors).map(fn=>fn());
test('batch 03 directly validates exact replay and browser consumer',()=>{
 assert.equal(docs.length,4);assert.equal(Object.keys(authors).length,4);
 for(const d of docs){const r=validateProblem(d,library);assert.equal(r.solutions,2);assert.equal(r.stages,16);const parsed=consumer.parse(JSON.stringify(d));assert.equal(parsed.solutions.length,2);
 for(const sol of d.solutions){assert.equal(sol.stages.length,8);assert.ok(sol.apis.length>=2);assert.ok(sol.algorithms.length>=2);assert.ok(sol.stages.every(s=>s.operations.length&&s.invariants.length&&s.checkIds.length));
 for(const c of sol.acceptanceCases.filter(c=>c.evidence)){const file=path.resolve(__dirname,'..',c.evidence.testFile);assert.ok(fs.existsSync(file));assert.ok(fs.readFileSync(file,'utf8').includes(c.evidence.testName));}}
 }
});
test('batch 03 every stage and collapsed subsystem passes shared spatial checker',async()=>{const report=await audit(docs);assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));});
