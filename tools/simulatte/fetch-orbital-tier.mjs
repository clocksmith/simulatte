#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const outputDir = path.join(root, 'public/data/orbital-transfer-planner');
const start = arg('--start') || '2030-09-15';
const stop = arg('--stop') || '2032-09-14';
const step = arg('--step') || '1 d';
const bodies = { sun:'10', mercury:'199', venus:'299', earth:'399', moon:'301', mars:'499', jupiter:'599', saturn:'699', uranus:'799', neptune:'899' };
fs.mkdirSync(outputDir,{recursive:true});

const dataset = { schema:'simulatte.jplHorizonsHeliocentricVectors.v1', id:'jpl.horizons.heliocentric-vectors.v1', title:'JPL Horizons heliocentric Cartesian state vectors', epochStart:`${start}T00:00:00Z`, stepDays:parseStepDays(step), epochCount:null, sourceKind:'observed_jpl_horizons_vectors', provenance:{ source:'NASA/JPL Horizons API', retrievedAt:new Date().toISOString(), query:{center:'500@10',ephemType:'VECTORS',vecTable:2,outUnits:'AU-D',refPlane:'ECLIPTIC',refSystem:'ICRF',start,stop,step}, claimBoundary:'Pinned JPL Horizons state-vector snapshot for deterministic mission-design experiments; not an operational navigation service.' }, bodies:{} };
for (const [id, command] of Object.entries(bodies)) {
  process.stdout.write(`Fetching ${id}... `);
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
  const params = { format:'json', COMMAND:`'${command}'`, OBJ_DATA:"'YES'", MAKE_EPHEM:"'YES'", EPHEM_TYPE:"'VECTORS'", CENTER:"'500@10'", START_TIME:`'${start}'`, STOP_TIME:`'${stop}'`, STEP_SIZE:`'${step}'`, VEC_TABLE:"'2'", OUT_UNITS:"'AU-D'", REF_PLANE:"'ECLIPTIC'", REF_SYSTEM:"'ICRF'", CSV_FORMAT:"'YES'" };
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
  const response = await fetch(url,{headers:{'User-Agent':'Simulatte governed data builder'}});
  if(!response.ok) throw new Error(`Horizons ${id} HTTP ${response.status}`);
  const payload = await response.json();
  const vectors = parseVectors(payload.result || '');
  if(!vectors.length) throw new Error(`No vectors parsed for ${id}`);
  dataset.bodies[id] = { name:id[0].toUpperCase()+id.slice(1), command, vectors };
  process.stdout.write(`${vectors.length}\n`);
}
dataset.epochCount = Math.min(...Object.values(dataset.bodies).map((row)=>row.vectors.length));
const text = `${JSON.stringify(dataset,null,2)}\n`;
const output = path.join(outputDir,'jpl-horizons-heliocentric-vectors-v1.json');
fs.writeFileSync(output,text);
console.log(`Wrote ${output} sha256=${sha256(text)}`);

function parseVectors(result) {
  const lines=result.split(/\r?\n/); let active=false; const rows=[];
  for(const raw of lines){ const line=raw.trim(); if(line==='$$SOE'){active=true;continue;} if(line==='$$EOE')break; if(!active||!line)continue;
    const columns=parseCsv(line); const jd=Number(columns[0]);
    const numbers=columns.slice(2).map(Number).filter(Number.isFinite);
    if(!Number.isFinite(jd)||numbers.length<6)continue;
    rows.push({day:rows.length,julianDateTdb:jd,calendarDateTdb:String(columns[1]||'').trim(),positionAu:numbers.slice(0,3),velocityAuD:numbers.slice(3,6)});
  }
  return rows;
}
function parseCsv(line){const out=[];let current='';let quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){quoted=!quoted;continue;}if(c===','&&!quoted){out.push(current.trim());current='';}else current+=c;}out.push(current.trim());return out;}
function parseStepDays(value){const match=String(value).match(/([0-9.]+)/);return match?Number(match[1]):1;}
function arg(name){const prefix=`${name}=`;return process.argv.find((row)=>row.startsWith(prefix))?.slice(prefix.length)||null;}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
