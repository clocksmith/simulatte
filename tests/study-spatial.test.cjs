'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Layout=require('../public/simulatte/system-diagram/study/spatial-layout.js'),Routing=require('../public/simulatte/system-diagram/study/spatial-routing.js'),Check=require('../public/simulatte/system-diagram/study/spatial-check.js');
const policy=require('../public/data/system-diagram/spatial-policy.json'),metrics=require('../public/data/system-diagram/study-font-metrics.json'),doc=require('../public/data/system-diagram/composable-solutions/l004.json');
test('the checker rejects colliding nodes, labels, and arrows through unrelated components',()=>{
 const graph={nodes:[{id:'a'},{id:'b'},{id:'c'}]},view={shapes:new Map([['a',{mode:'box',r:{x:0,y:0,w:100,h:100}}],['b',{mode:'box',r:{x:50,y:0,w:100,h:100}}],['c',{mode:'box',r:{x:300,y:0,w:100,h:100}}]])};
 const result=Check.check(graph,view,[{id:'edge',source:'a',target:'c',points:[[100,50],[300,50]],label:{x:50,y:20,w:60,h:20}}]);
 assert.equal(result.ok,false);for(const kind of ['node-overlap','edge-through-node','label-node-overlap'])assert.ok(result.errors.some(e=>e.kind===kind),kind);
});
test('Chat final stage has deterministic obstacle-free routes and real nested boundaries',async()=>{
 const sol=doc.solutions[0],g=sol.stages.at(-1).graph;await Layout.prepare(doc);
 const one=Layout.shapes(doc,sol,g),routes=Routing.route(doc,g,one);assert.equal(Check.check(g,one,routes).ok,true);
 assert.equal(one.shapes.get('chat').mode,'boundary');assert.equal(routes.length,g.edges.length);
 const snapshot=JSON.stringify({shapes:[...one.shapes],routes});Layout.configure(policy,metrics);await Layout.prepare(doc);const two=Layout.shapes(doc,sol,g);
 assert.equal(JSON.stringify({shapes:[...two.shapes],routes:Routing.route(doc,g,two)}),snapshot);
 for(const edge of routes){assert.ok(edge.points.length>=2);assert.ok(edge.label.w>0);}
});
test('nested collapse resolves to the visible outer boundary',()=>{
 const graph={nodes:[{id:'outer',subsystemId:'o'},{id:'inner',subsystemId:'i',parentId:'outer'},{id:'leaf',parentId:'inner'}],edges:[]};
 assert.equal(Layout.resolve(graph,new Map(),{nodeId:'leaf',portId:'in'},new Set(['outer','inner'])),'outer');
});
