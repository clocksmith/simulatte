'use strict';
// Reproducible compatibility patch for the pinned upstream build, not a new drawing engine.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const DIR=path.join(ROOT,'public/simulatte/system-diagram/study/vendor');
const ASSET='excalidraw.production.min.js';
const ORIGINAL_SHA256='27b133f845543f091aa518924b5b2fdd7eb52a9e490de100b9bc3bfd2ae2f314';
const PATCH_ID='layer-shortcut-modifier-priority';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function transform(source){
 for(const name of ['sendBackward','bringForward']){
  const token='name:"'+name+'"',at=source.indexOf(token);if(at<0||source.indexOf(token,at+1)>=0)throw Error('Expected one pinned action '+name);
  const end=source.indexOf('PanelComponent:',at),part=source.slice(at,end);
  const old='&&!e.shiftKey&&e.code',next='&&!e.shiftKey&&!e.altKey&&e.code';
  if(!part.includes(old)||part.split(old).length!==2)throw Error('Unexpected pinned predicate for '+name);
  source=source.slice(0,at)+part.replace(old,next)+source.slice(end);
 }
 return source;
}
function sorted(value){return Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;}
function main(){
 const file=path.join(DIR,ASSET),receiptFile=path.join(DIR,'versions.json');
 const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));if(receipt['@excalidraw/excalidraw']!=='0.17.6')throw Error('Re-review compatibility before changing upstream version');
 const source=fs.readFileSync(file,'utf8'),hash=digest(source),prior=receipt.compatibilityPatches?.find(p=>p.id===PATCH_ID);
 if(prior&&hash===prior.resultSha256&&receipt.sha256[ASSET]===hash){console.log('Excalidraw layer shortcut patch verified');return;}
 if(process.argv.includes('--check'))throw Error('Pinned Excalidraw layer shortcut patch is missing or modified');
 if(hash!==ORIGINAL_SHA256)throw Error('Refuse to patch an unrecognized Excalidraw build');
 const result=transform(source),resultSha256=digest(result);
 receipt.sha256[ASSET]=resultSha256;
 receipt.compatibilityPatches=[{id:PATCH_ID,tool:'tools/simulatte/patch-study-excalidraw.cjs',asset:ASSET,sourceSha256:ORIGINAL_SHA256,resultSha256,upstreamSource:'https://raw.githubusercontent.com/excalidraw/excalidraw/v0.17.6/src/actions/actionZindex.tsx',reason:'One-step layer actions must reject Alt/Option so their higher priority cannot shadow the Help-listed front/back shortcuts.'}];
 fs.writeFileSync(file,result);fs.writeFileSync(receiptFile,JSON.stringify(sorted(receipt),null,2)+'\n');
 console.log('Applied pinned Excalidraw layer shortcut compatibility patch');
}
if(require.main===module)main();
module.exports={transform,ORIGINAL_SHA256};
