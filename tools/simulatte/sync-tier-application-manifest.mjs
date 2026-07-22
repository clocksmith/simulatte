#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const manifestPath=path.join(root,'public/data/simulatte/tier-application-manifest.json');
const write=process.argv.includes('--write');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
let changed=false;
for(const [tier,row] of Object.entries(manifest.tiers||{})){
  for(const reference of [row.world,...(row.profiles||[])]){
    const file=path.resolve(path.dirname(manifestPath),reference.path);
    if(!fs.existsSync(file))throw new Error(`Tier ${tier} reference missing: ${file}`);
    const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(reference.sha256!==sha256){reference.sha256=sha256;changed=true;}
  }
}
const expected=`${JSON.stringify(sortValue(manifest),null,2)}\n`;
if(changed&&!write)throw new Error('Tier application manifest hashes are stale; run npm run simulatte:tiers:sync');
if(write)fs.writeFileSync(manifestPath,expected);
console.log(`TIER-APPLICATION-MANIFEST status=${write?'written':'verified'} changed=${changed}`);
function sortValue(value){if(Array.isArray(value))return value.map(sortValue);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,sortValue(value[key])]));}
