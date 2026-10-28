'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('autonomy source limit includes nested authored JavaScript and excludes pinned vendor distributions',async()=>{
 const {publicAutonomyJavaScript}=await import('../tools/simulatte/check-autonomy-data.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'simulatte-source-inventory-'));
 try{const names=['simulatte/study/vendor/elk/worker.js','simulatte/study/renderer.js','simulatte/vendorish/runtime.js','shared/contracts/state.js'];for(const name of names){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'const x=1;\n'.repeat(1100));}
  assert.deepEqual(publicAutonomyJavaScript(root).map(p=>path.relative(root,p)),names.slice(1).sort());
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
