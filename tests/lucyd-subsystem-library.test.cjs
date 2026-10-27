'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),config=require('../public/data/system-diagram/config.json'),library=require('../public/simulatte/system-diagram/class-library.js').loadSync(base),D=require('../public/simulatte/system-diagram/diagram.js'),M=require('../public/simulatte/system-diagram/editor-model.js'),P=require('../public/simulatte/system-diagram/palette.js'),catalogue=require('../public/data/system-diagram/subsystem-library.json');
test('blank documents expose reusable connected subsystems without importing them or creating instances',()=>{
  const doc=D.emptyDiagram(config),before=structuredClone(doc),rows=P.railClasses(doc,library,config,catalogue).filter(c=>c.kernel==='subsystem');
  assert.equal(rows.length,7);assert.ok(rows.every(c=>c.componentCount>1&&c.connectionCount>0&&c.starterLibrary));assert.deepEqual(doc,before);
});
test('every library subsystem inserts with its dependency closure in one undoable command',()=>{
  for(const def of catalogue.subsystems){const m=M.create({diagram:D.emptyDiagram(config),library,config});const bundle=P.subsystemBundle(catalogue,def),before=structuredClone(m.diagram);
    const result=m.apply({type:'insertSubsystem',definitionId:def.id,version:def.version,library:bundle,x:0,y:0});assert.equal(result.ok,true,result.error);
    assert.equal(m.diagram.nodes.length,1);assert.ok(D.compile(m.diagram,library,config).nodes.length>=def.nodes.length);
    assert.equal(m.undo().ok,true);assert.deepEqual(m.diagram,before);assert.equal(m.redo().ok,true);
  }
});
test('library insertion preserves unresolved sketch identities and refuses immutable definition conflicts atomically',()=>{
  const conceptual=D.addConcept(D.emptyDiagram(config),{id:'intent',label:'Unresolved',x:0,y:0},library,config).diagram,m=M.create({diagram:conceptual,library,config}),def=catalogue.subsystems[0],bundle=P.subsystemBundle(catalogue,def);
  assert.equal(m.apply({type:'insertSubsystem',definitionId:def.id,version:def.version,library:bundle,x:100,y:100}).ok,true);
  assert.equal(m.diagram.schema,D.DESIGN_SCHEMA);assert.equal(m.diagram.concepts[0].id,'intent');
  const before=structuredClone(m.diagram),bad=structuredClone(bundle);bad.subsystems[0].label='Conflicting definition';
  const r=m.apply({type:'insertSubsystem',definitionId:def.id,version:def.version,library:bad,x:200,y:200});assert.equal(r.ok,false);assert.match(r.error,/immutable/);assert.deepEqual(m.diagram,before);
});
