import fs from 'node:fs';
import crypto from 'node:crypto';
const models={
  'gpu-supercluster':{workload:'workload.js',topology:'cluster-topology.js',collectives:'collective-solver.js',thermals:'thermal-model.js'},
  'orbital-transfer-planner':{MODEL_HASH:'launch-window.js',VERIFIER_HASH:'n-body-verifier.js',EPHEMERIS_HASH:'ephemeris.js'},
};
for(const [plugin,entries] of Object.entries(models)){
  const directory=new URL(`../../public/shared/plugins/${plugin}/`,import.meta.url),target=new URL('v4-contribution.js',directory);
  const before=fs.readFileSync(target,'utf8');let source=before;
  for(const [name,file] of Object.entries(entries)){
    const digest=crypto.createHash('sha256').update(fs.readFileSync(new URL(file,directory))).digest('hex');
    const pattern=new RegExp(`(${name}(?::| =) ')[a-f0-9]{64}(')`);
    if(!pattern.test(source))throw Error(`Missing model hash declaration: ${plugin}/${name}`);
    source=source.replace(pattern,(_,prefix,suffix)=>prefix+digest+suffix);
  }
  if(process.argv.includes('--write')){if(source!==before)fs.writeFileSync(target,source);}
  else if(source!==before)throw Error(`${plugin} model source hashes are stale; run npm run plugins:sync`);
  console.log(`${plugin} model hashes ${source===before?'match':'updated'}`);
}
