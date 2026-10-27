'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('HTML loads the complete simulation dependencies in executable browser-global order',async()=>{
 const root=path.resolve(__dirname,'../public/simulatte/system-diagram'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script defer src="([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
 const selected=scripts.filter(src=>src.includes('/shared/contracts/')||src.includes('multirate-coordinator')||/^\.\/(class-library|subsystems|diagram|protocol-routing|kernel-registry|study-runtime|study-commands|kernels-[a-z-]+|engine[-a-z]*|runner)\.js$/.test(src));
 const context=vm.createContext({structuredClone,TextEncoder,TextDecoder,performance,console});
 for(const src of selected)vm.runInContext(fs.readFileSync(path.resolve(root,src),'utf8'),context,{filename:src});
 const L=require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(root,'../../data/system-diagram'));
 const config=require('../public/data/system-diagram/config.json');
 assert.ok(scripts.indexOf('./runner.js')<scripts.indexOf('./playback.js'));assert.ok(scripts.indexOf('./playback.js')<scripts.indexOf('./page.js'));
 const runner=await context.SimulatteSystemDiagramRunner.create({diagram:require('../public/data/system-diagram/examples/microsoft-presence.json'),library:L,config,kernels:context.SimulatteSystemDiagramKernels});
 try{runner.advanceTo(20);assert.ok(runner.view().global.completed>0);assert.equal((await runner.verify()).status,'match');}finally{await runner.dispose();}
});
