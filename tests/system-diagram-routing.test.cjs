'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Routing = require('../public/simulatte/system-diagram/edge-routing.js');
const box = (x, y, w = 176, h = 72) => ({x, y, w, h});
function connected(a, b) {
  const out={nodeId:'a',id:'out',direction:'out'}, input={nodeId:'b',id:'in',direction:'in'};
  const peers=new Map([['a.out',[{x:b.x+b.w/2,y:b.y+b.h/2}]],['b.in',[{x:a.x+a.w/2,y:a.y+a.h/2}]]]);
  return [Routing.layoutPorts(a,[out],peers)[0],Routing.layoutPorts(b,[input],peers)[0]];
}
function assertClear(route, boxes) {
  assert.equal(route.blocked,false);
  for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i];
    assert.ok(a.x===b.x||a.y===b.y,'each segment follows a node-side normal or orthogonal bend');
    assert.ok(Routing.clearSegment(a,b,boxes),JSON.stringify({a,b,boxes}));
  }
}
test('vertical and reverse connections use the facing node sides without forced right-left loops',()=>{
  for(const [a,b,sides] of [[box(0,0),box(0,220),['bottom','top']],[box(400,0),box(0,0),['left','right']]]) {
    const ports=connected(a,b);assert.deepEqual(ports.map(p=>p.side),sides);
    const route=Routing.route(...ports,[a,b]);assertClear(route,[a,b]);
    assert.equal(route.points.length,2,'facing ports need no bends');
  }
});
test('a blocking component forces a deterministic clear detour with rounded corners',()=>{
  const a=box(0,0),b=box(500,0),obstacle=box(240,-40,150,150),ports=connected(a,b);
  const route=Routing.route(...ports,[a,b,obstacle]);assertClear(route,[a,b,obstacle]);
  assert.ok(route.points.some(p=>p.y>=122||p.y<=-52),'route clears the expanded obstacle');
  assert.match(Routing.path(route.points),/Q/);
  assert.deepEqual(Routing.route(...ports,[a,b,obstacle]),route);
  assert.ok(Number.isFinite(Routing.label(route.points).x));
});
test('return links leave and enter perpendicularly and stay outside their own node',()=>{
  const a=box(0,0),out={x:176,y:24,nx:1,ny:0},input={x:0,y:48,nx:-1,ny:0};
  const route=Routing.route(out,input,[a]);assertClear(route,[a]);
  assert.ok(route.points[1].x>route.points[0].x);
  assert.ok(route.points.at(-2).x<route.points.at(-1).x);
});
test('routing moves with blockers, handles several obstacles and never mutates authored geometry',()=>{
  const a=box(0,0),b=box(700,250),obstacles=[a,b,box(210,-80,90,300),box(400,140,100,300)],before=structuredClone(obstacles);
  const ports=connected(a,b),route=Routing.route(...ports,obstacles);assertClear(route,obstacles);
  assert.deepEqual(obstacles,before);
  obstacles[2].y=-400;const moved=Routing.route(...ports,obstacles);assertClear(moved,obstacles);
  assert.notDeepEqual(moved.points,route.points);
});
test('ports with several links share one stable typed endpoint and unconnected ports remain reachable',()=>{
  const ports=[{id:'out',nodeId:'a',direction:'out'},{id:'empty',nodeId:'a',direction:'in'}];
  const result=Routing.layoutPorts(box(0,0),ports,new Map([['a.out',[{x:500,y:20},{x:500,y:60}]]]));
  assert.equal(result.length,2);assert.equal(result.find(p=>p.port.id==='out').side,'right');
  assert.equal(result.find(p=>p.port.id==='empty').side,'left');
});
test('close facing components connect directly instead of looping around intersecting exit stubs',()=>{
  const a=box(0,0),b=box(208,0),ports=connected(a,b),route=Routing.route(...ports,[a,b]);
  assertClear(route,[a,b]);assert.equal(route.points.length,2);
});
test('ports on the same side follow neighbor order instead of introducing crossings from their names',()=>{
  const ports=[{id:'a',nodeId:'n',direction:'out'},{id:'z',nodeId:'n',direction:'out'}];
  const peers=new Map([['n.a',[{x:500,y:60}]],['n.z',[{x:500,y:10}]]]);
  const placed=Routing.layoutPorts(box(0,0),ports,peers);
  assert.deepEqual(placed.map(p=>p.port.id),['z','a']);assert.ok(placed[0].y<placed[1].y);
});
