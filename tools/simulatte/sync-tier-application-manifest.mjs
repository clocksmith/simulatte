#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const manifestPath=path.join(root,'public/data/simulatte/tier-application-manifest.json');
const write=process.argv.includes('--write');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.schema!=='simulatte.tierApplicationManifest.v3')throw new Error('Tier application manifest must use simulatte.tierApplicationManifest.v3');
let changed=false;
for(const [tier,row] of Object.entries(manifest.tiers||{})){
  if(row.world)throw new Error(`Tier ${tier} mixes a v2 tier-level world into manifest v3`);
  const ids=new Set();
  if(!Array.isArray(row.profiles)||!row.profiles.length)throw new Error(`Tier ${tier} has no profiles`);
  for(const profile of row.profiles){
    if(ids.has(profile.id))throw new Error(`Tier ${tier} duplicates profile ${profile.id}`);
    ids.add(profile.id);
    if(!profile.world)throw new Error(`Tier ${tier} profile ${profile.id} has no world reference`);
    for(const reference of [profile,profile.world]){
      if(!reference.id||!reference.path)throw new Error(`Tier ${tier} has an incomplete reference`);
    const file=path.resolve(path.dirname(manifestPath),reference.path);
    if(!fs.existsSync(file))throw new Error(`Tier ${tier} reference missing: ${file}`);
    const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(reference.sha256!==sha256){reference.sha256=sha256;changed=true;}
    }
  }
  if(!ids.has(row.defaultProfileId))throw new Error(`Tier ${tier} default profile ${row.defaultProfileId} is not declared`);
}
const expected=`${JSON.stringify(sortValue(manifest),null,2)}\n`;
if(changed&&!write)throw new Error('Tier application manifest hashes are stale; run npm run simulatte:tiers:sync');
if(write)fs.writeFileSync(manifestPath,expected);
console.log(`TIER-APPLICATION-MANIFEST status=${write?'written':'verified'} changed=${changed}`);
function sortValue(value){if(Array.isArray(value))return value.map(sortValue);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,sortValue(value[key])]));}
