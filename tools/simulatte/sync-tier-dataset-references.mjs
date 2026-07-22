#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const plugins=path.join(root,'public/shared/plugins');
const write=process.argv.includes('--write');
let changes=0;
for(const entry of fs.readdirSync(plugins,{withFileTypes:true}).filter((row)=>row.isDirectory())){
 const manifestPath=path.join(plugins,entry.name,'plugin.json');if(!fs.existsSync(manifestPath))continue;
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));let changed=false;
 for(const declaration of manifest.datasets||[]){if(!declaration.reference)continue;const file=path.resolve(path.dirname(manifestPath),declaration.reference.path);if(!fs.existsSync(file))throw new Error(`${entry.name} dataset missing: ${file}`);const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(declaration.reference.sha256!==hash){declaration.reference.sha256=hash;changed=true;}}
 if(changed){changes++;if(write)fs.writeFileSync(manifestPath,`${JSON.stringify(sortValue(manifest),null,2)}\n`);else throw new Error(`${entry.name} dataset references are stale; run npm run simulatte:tiers:data:sync`);}
}
console.log(`TIER-DATASET-REFERENCES status=${write?'written':'verified'} changed=${changes}`);
function sortValue(value){if(Array.isArray(value))return value.map(sortValue);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,sortValue(value[key])]));}
