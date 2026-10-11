import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const worldPath = 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json';
const input = 'tools/simulatte/data/solar-route-elevation-v1.json';
const output = 'public/data/solar-drive/union-square-route-v1.json';
const world = JSON.parse(await fs.readFile(path.join(root, worldPath)));
const model = require('../../public/simulatte/world/world-model.js').createWorldModel(world);
const planner = require('../../public/simulatte/world/route-planner.js');
const identity = require('../../public/shared/contracts/world-spec.js');
const policy = require('../../public/data/simulatte/policies/bet-selector-v1.json');
const route = planner.planRoute({worldModel:model, originNodeId:'bike-node-77af8331a291', destinationNodeId:'bike-node-0d3d1f807393',
  mode:'delivery_bike', tick:0, mission:{constraints:{}}, policy});
const segments = route.segmentIds.map(id => model.segment(id));
let distanceM = 0;
const points = [];
for (const segment of segments) {
  for (const point of segment.geometry) {
    const prior = points.at(-1);
    if (prior && Math.hypot(point.x-prior.x,point.y-prior.y) < 0.01) continue;
    if (prior) distanceM += Math.hypot(point.x-prior.x,point.y-prior.y);
    points.push({...point, distanceM, street:segment.source.street});
  }
}
const origin = world.coordinateSystem.originWgs84;
for (const p of points) {
  p.latitude = origin.latitude + p.y / 110540;
  p.longitude = origin.longitude + p.x / (111320 * Math.cos(origin.latitude*Math.PI/180));
}
if (process.argv.includes('--fetch')) {
  const queries = [];
  for (let i=0;i<points.length;i+=4) {
    const rows = await Promise.all(points.slice(i,i+4).map(async point => {
      const url = `https://epqs.nationalmap.gov/v1/json?x=${point.longitude}&y=${point.latitude}&units=Meters&wkid=4326&includeDate=true`;
      const response = await fetch(url,{signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw Error(`USGS elevation ${response.status}`);
      const bytes = await response.text(), record = JSON.parse(bytes);
      if (!Number.isFinite(Number(record.value)) || Number(record.value)<-100) throw Error('USGS elevation missing');
      return {url, point:{x:point.x,y:point.y}, sha256:crypto.createHash('sha256').update(bytes).digest('hex'), bytes, record};
    }));
    queries.push(...rows);
  }
  await fs.mkdir(path.dirname(path.join(root,input)),{recursive:true});
  await fs.writeFile(path.join(root,input),JSON.stringify({retrievedAt:new Date().toISOString(),queries},null,2)+'\n');
}
const elevation = JSON.parse(await fs.readFile(path.join(root,input)));
for (const [i,p] of points.entries()) {
  const q=elevation.queries[i];
  if (!q || q.point.x!==p.x || q.point.y!==p.y || crypto.createHash('sha256').update(q.bytes).digest('hex')!==q.sha256
    || identity.canonicalJson(JSON.parse(q.bytes))!==identity.canonicalJson(q.record)) throw Error('Frozen elevation query identity differs');
  p.elevationM = Number(q.record.value);
}
distanceM=0;
for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];distanceM+=Math.hypot(b.x-a.x,b.y-a.y,b.elevationM-a.elevationM);b.distanceM=distanceM;}
const bounds={minX:Math.min(...points.map(p=>p.x))-700,maxX:Math.max(...points.map(p=>p.x))+700,
  minY:Math.min(...points.map(p=>p.y))-700,maxY:Math.max(...points.map(p=>p.y))+700};
const buildings=world.renderGeometry.buildings.filter(b=>b.footprint.some(p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.y>=bounds.minY&&p.y<=bounds.maxY))
  .map(({id,footprint,interiorRings,heightM,groundElevationM,heightState,sourceObjectId})=>({id,footprint,interiorRings,heightM,groundElevationM,heightState,sourceObjectId}));
const data={schema:'simulatte.solarRideRoute.v1',id:'union-square-washington-square-v1',label:'Union Square to Washington Square',
  departureAt:'2024-07-18T16:00:00Z',timeZone:'America/New_York',origin,points,buildings,segmentIds:route.segmentIds,
  stops:[{id:'broadway-stop',label:'Broadway intersection',distanceM:points[3].distanceM,dwellS:10}],
  policy:{panelSamplesPerAxis:3,panelLengthM:1.85,panelHeightM:1.92,roadWidthM:6,diffuseFraction:0.15,
    maximumTimeS:1800,minimumSolarElevationDegrees:40,maximumShadowQueryM:700,arrivalToleranceM:0.5,stopToleranceM:0.5,stopApproachS:2.2,stopBufferM:.15,stoppedSpeedMs:.08},
  provenance:{worldId:world.id,worldPath,worldSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,worldPath))).digest('hex'),
    sourceSnapshotDate:world.provenance.snapshotDate,sources:world.provenance.sources,elevation:{publisher:'USGS 3DEP Elevation Point Query Service',
      url:'https://epqs.nationalmap.gov/v1/docs',frozenInput:input,retrievedAt:elevation.retrievedAt,
      sourceAcquisitionDates:[...new Set(elevation.queries.map(q=>q.record.attributes.AcquisitionDate))],
      resolutionM:[...new Set(elevation.queries.map(q=>q.record.resolution))],verticalDatum:'NAVD88 DEM; not a surveyed road profile'}},
  assumptions:['Clear-sky irradiance, cloud fraction and wind are scenario inputs, not recorded weather.',
    'The stop is an authored traffic-light experiment, not observed signal timing.',
    'Building roof prisms omit trees, facade detail and diffuse sky occlusion. Partial-panel output uses area averaging, not a bypass-diode electrical model.',
    'The street route is frozen geometry, not current navigation advice. Elevation is DEM-derived and interpolated between route vertices.'],
  calibration:'not-performed'};
data.contentHash=identity.contentHash(data);
const serialized=JSON.stringify(JSON.parse(identity.canonicalJson(data)),null,2)+'\n';
if (process.argv.includes('--write')) {
  await fs.mkdir(path.dirname(path.join(root,output)),{recursive:true});await fs.writeFile(path.join(root,output),serialized);
} else if (await fs.readFile(path.join(root,output),'utf8')!==serialized) throw Error('Solar route stale: build-solar-route.mjs --write');
console.log(`Solar route: ${points.length} elevation points, ${buildings.length} buildings, ${distanceM.toFixed(1)} m, ${data.contentHash}`);
