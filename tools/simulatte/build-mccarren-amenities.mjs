import fs from 'node:fs';
import crypto from 'node:crypto';
const input=process.argv[2];
if(!input)throw new Error('Usage: node tools/simulatte/build-mccarren-amenities.mjs source.osm');
const base=new URL('../../public/simulatte/motorcycle-noise/',import.meta.url);
const map=JSON.parse(fs.readFileSync(new URL('nyc-map.json',base),'utf8'));
const track=JSON.parse(fs.readFileSync(new URL('mccarren-track.json',base),'utf8'));
const xml=fs.readFileSync(input,'utf8');
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const tags=text=>Object.fromEntries([...text.matchAll(/<tag\b([^>]+)\/>/g)].map(m=>{const a=attrs(m[1]);return [a.k,a.v];}));
const project=(lat,lon)=>({x:(lon-map.origin.longitude)*111320*Math.cos(map.origin.latitude*Math.PI/180),y:(lat-map.origin.latitude)*110540});
const nodes=new Map([...xml.matchAll(/<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g)].map(m=>{const a=attrs(m[1]);return[a.id,project(Number(a.lat),Number(a.lon))];}));
const parks=map.parks.filter(p=>/mccarren/i.test(p.label||''));
if(!parks.length)throw new Error('Missing McCarren park polygons');
function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
const inPark=p=>parks.some(park=>inside(p,park.outerRing)&&!(park.holes||park.innerRings||[]).some(hole=>inside(p,hole)));
const ways=[...xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)].map(m=>({id:'osm-way-'+attrs(m[1]).id,tags:tags(m[2]),points:[...m[2].matchAll(/<nd ref="([^"]+)"/g)].map(n=>nodes.get(n[1])).filter(Boolean)}));
const facilities=ways.filter(w=>w.points.length>3&&(w.tags.sport||['dog_park','playground','swimming_pool'].includes(w.tags.leisure))&&w.tags.sport!=='running').filter(w=>w.points.some(inPark)).map(w=>({id:w.id,kind:w.tags.sport||w.tags.leisure,name:w.tags.name||w.tags.sport||w.tags.leisure,ring:w.points,tags:w.tags}));
const paths=[];
for(const way of ways.filter(w=>['footway','path'].includes(w.tags.highway)&&w.tags.footway!=='crossing')){
 let run=[];
 const finish=()=>{if(run.length>1)paths.push({id:way.id+'-'+paths.length,points:run,width:Number.parseFloat(way.tags.width)||2.4});run=[];};
 for(let i=0;i<way.points.length-1;i++){
  const a=way.points[i],b=way.points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/3));
  for(let j=0;j<=steps;j++){const p={x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps};if(inPark(p)){if(!run.length||Math.hypot(p.x-run.at(-1).x,p.y-run.at(-1).y)>.1)run.push(p);}else finish();}
 }
 finish();
}
const asset={schema:'simulatte.mccarrenAmenities.v1',origin:map.origin,facilities,paths,trackExclusions:track.tracks.map(t=>t.outerRing),provenance:{source:'https://api.openstreetmap.org/api/0.6/map?bbox=-73.955,40.718,-73.948,40.725',sha256:crypto.createHash('sha256').update(xml).digest('hex'),license:'ODbL-1.0',attribution:'OpenStreetMap contributors',parkBoundaries:'Existing NYC Parks snapshot',illustrative:['Supplementary trees are seeded planting, not surveyed tree positions.','Visitors, dogs, strollers, court markings, and equipment are illustrative; not observations or acoustic sources.']}};
fs.writeFileSync(new URL('mccarren-amenities.json',base),JSON.stringify(asset));
console.log(JSON.stringify({generated:'mccarren-amenities.json',facilities:facilities.reduce((counts,row)=>(counts[row.kind]=(counts[row.kind]||0)+1,counts),{}),paths:paths.length}));
