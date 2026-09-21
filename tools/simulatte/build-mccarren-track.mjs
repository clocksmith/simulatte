import fs from 'node:fs';
import crypto from 'node:crypto';

// Input: the OSM map API XML snapshot for the McCarren Park bounding box.
const input=process.argv[2];
if(!input)throw new Error('Usage: node tools/simulatte/build-mccarren-track.mjs <osm-map.xml>');
const bytes=fs.readFileSync(input),xml=bytes.toString(),nodes=new Map(),ways=new Map();
const attributes=text=>Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
for(const match of xml.matchAll(/<node\b[^>]*>/g)){const a=attributes(match[0]);nodes.set(a.id,{longitude:Number(a.lon),latitude:Number(a.lat)});}
for(const match of xml.matchAll(/<way\b[\s\S]*?<\/way>/g)){const id=attributes(match[0].split('>')[0]).id;ways.set(id,[...match[0].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map(row=>nodes.get(row[1])));}
const relation=[...xml.matchAll(/<relation\b[\s\S]*?<\/relation>/g)].find(row=>attributes(row[0].split('>')[0]).id==='4102021')?.[0];
if(!relation)throw new Error('McCarren running-track relation 4102021 is missing');
const tags=Object.fromEntries([...relation.matchAll(/<tag k="([^"]+)" v="([^"]*)"\s*\/>/g)].map(row=>[row[1],row[2]]));
if(tags.leisure!=='track'||tags.sport!=='running')throw new Error('OSM relation is not a running track');
const members=[...relation.matchAll(/<member\b[^>]*>/g)].map(row=>attributes(row[0]));
const outer=members.filter(row=>row.role==='outer'),inner=members.filter(row=>row.role==='inner');
if(outer.length!==1||inner.length!==1)throw new Error('Expected one complete outer and inner track outline');
const sourceRings=[...outer,...inner].map(row=>ways.get(row.ref));
if(sourceRings.some(ring=>!ring||ring.length<4||ring.some(p=>!p||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))))throw new Error('Track snapshot contains missing geometry');
const city=JSON.parse(fs.readFileSync('public/simulatte/motorcycle-noise/nyc-map.json'));
const origin=city.origin;
const project=p=>({x:(p.longitude-origin.longitude)*Math.cos(origin.latitude*Math.PI/180)*111320,y:(p.latitude-origin.latitude)*110540});
const rings=sourceRings.map(ring=>ring.map(project)),lanes=Number(tags.lanes);
if(!Number.isInteger(lanes)||lanes<1||lanes>12)throw new Error('Track lane count is absent or invalid');
const data={schema:'simulatte.mccarrenTrack.v1',origin,tracks:[{id:'osm-relation-4102021',label:'McCarren Park running track',outerRing:rings[0],interiorRings:rings.slice(1),lanes}],
  provenance:{source:'https://www.openstreetmap.org/relation/4102021',retrievalUrl:'https://api.openstreetmap.org/api/0.6/map?bbox=-73.955,40.718,-73.948,40.725',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),attribution:'OpenStreetMap contributors',license:'ODbL 1.0',sourceWgs84Rings:sourceRings,sourceRelationAttributes:attributes(relation.split('>')[0]),sourceTags:tags,limitations:'Outer and inner boundaries are mapped geometry. Intermediate lane stripes are interpolated presentation, not surveyed lane centerlines.'}};
fs.writeFileSync('public/simulatte/motorcycle-noise/mccarren-track.json',JSON.stringify(data));
console.log('Generated McCarren track geometry with '+lanes+' lanes');
