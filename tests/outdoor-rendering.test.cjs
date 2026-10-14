const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sky=require('../public/shared/render/atmospheric-sky.js');
const math=require('../public/simulatte/app/webgpu-math.js');
const shadows=require('../public/simulatte/app/webgpu-sun-shadow.js');
test('sky inverse reconstructs camera matrices with both depth conventions',()=>{
  for(const reversed of [false,true]){
    const m=math.multiply(math.perspective(.65,1.5,.05,6000,reversed),math.lookAt([8,6,12],[0,1,0]));
    const product=math.multiply(m,sky.inverse(m));
    for(let i=0;i<16;i++) assert.ok(Math.abs(product[i]-Number(i%5===0))<.0001);
  }
  assert.throws(()=>sky.inverse(new Float32Array(16)),/singular/);
});
test('sky refuses invalid sun vectors and cloud coverage',()=>{
  for(const s of [[0,0,0],[NaN,1,0],[1,2]])assert.throws(()=>sky.validate(s,0));
  for(const c of [-.01,1.01,NaN])assert.throws(()=>sky.validate([1,1,0],c));
  sky.validate([1,-1,0],.5);
});
test('street shadow map resolves a close subject and remains texel stable',()=>{
  const sun={directionToSun:[.3,.8,.4]},a=shadows.projection(sun,[0,0,0],150),b=shadows.projection(sun,[.001,0,0],150);
  assert.equal(a.extent,240);assert.ok(a.matrix[12]===b.matrix[12]);assert.ok(a.matrix[13]===b.matrix[13]);
  assert.ok(shadows.projection(sun,[0,0,0],1800).extent>=1800);
});
test('solar buildings use closed roof triangulation and solid walls instead of outlines',()=>{
  const context={globalThis:null,earcut:require('../public/simulatte/motorcycle-noise/vendor/earcut.js')};context.globalThis=context;vm.createContext(context);
  for(const f of ['geometry.js','route-scene.js'])vm.runInContext(fs.readFileSync('public/simulatte/solar-drive/'+f,'utf8'),context);
  const data={points:[{x:-10,y:0,elevationM:0},{x:10,y:0,elevationM:0}],policy:{roadWidthM:6},buildings:[{id:'b',heightM:10,groundElevationM:2,footprint:[{x:1,y:1},{x:5,y:1},{x:5,y:5},{x:1,y:5},{x:1,y:1}],interiorRings:[]}]};
  const machine={instances:[],anchors:{},timeS:0},env={point:{x:0,y:0,heading:0,elevationM:0},grade:0,occluderIds:[],directFraction:1,sunDirection:[1,1,0],
    samples:Array.from({length:9},()=>({state:'direct',occluderId:null}))};
  const frame=context.SimulatteSolarRideScene.create(data).frame(machine,env,{shade:0,cloud:.2});
  const roofs=frame.instances.filter(n=>n.mesh==='triangle'),walls=frame.instances.filter(n=>n.material[2]===7);
  assert.equal(roofs.length,2);assert.equal(walls.length,4);assert.equal(frame.cloudCover,.2);
  assert.ok(walls.every(n=>Math.abs(n.matrix[13]-n.matrix[5]/2+.15)<1e-5));
  assert.ok(roofs.every(n=>n.matrix[13]===12));
});
test('motorcycle actor shadow admission keeps nearest 64 without removing simulation actors',()=>{
  const admitted=new Set();
  class Shadow {constructor(){}setDarkness(){}addShadowCaster(node){if(node.name?.startsWith('actor-'))admitted.add(node);}removeShadowCaster(node){admitted.delete(node);}}
  class Color{constructor(){}static FromHexString(){return {};}}
  const mesh=()=>({});
  const B={Color3:Color,StandardMaterial:class{constructor(name){this.name=name;}},DynamicTexture:class{getContext(){return {fillRect(){}};}update(){}},CascadedShadowGenerator:Shadow,
    Mesh:class{constructor(name){this.name=name;}},VertexData:class{static ComputeNormals(){}applyToMesh(){}},
    Vector3:class {static DistanceSquared(a,b){return (a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;}},MeshBuilder:{CreateCylinder:mesh,CreateIcoSphere:mesh}};
  const context={globalThis:null};context.globalThis=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/simulatte/motorcycle-noise/babylon-city.js','utf8'),context);
  const scene={activeCamera:{position:{x:0,y:0,z:0}}},map={land:[],parks:[],tracks:[],trees:[],buildings:[],streets:[]};
  const city=context.MotorcycleBabylonCity.create(B,scene,map,{x:0,y:0},{});
  for(let i=0;i<100;i++){const child={name:'actor-'+i};city.vehicles.set(String(i),{name:'actor-'+i,position:{x:i,y:0,z:0},getChildMeshes(){return [child];}});}
  city.updateShadows();assert.equal(admitted.size,64);assert.equal(city.vehicles.size,100);
  assert.ok([...admitted].every(node=>Number(node.name.slice(6))<64));
  scene.activeCamera.position.x=1000;city.updateShadows();assert.equal(admitted.size,0);assert.equal(city.vehicles.size,100);
});
